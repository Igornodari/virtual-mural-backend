import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessagingService } from '../messaging.service';
import { MuralEvents } from '../events/mural.events';
import { NotificationsService } from '../../notifications/notifications.service';
import { WhatsAppService } from '../../notifications/whatsapp.service';
import { InAppNotificationsService } from '../../notifications/in-app-notifications.service';
import {
  NotificationType,
  NotificationPayload,
} from '../../notifications/entities/notification.entity';
import { User } from '../../users/entities/user.entity';
import { Appointment } from '../../appointments/entities/appointment.entity';

/**
 * Consumidor central de eventos do Virtual Mural.
 *
 * Cada evento RabbitMQ vira:
 *  1. UMA OU MAIS Notification in-app (DB + SSE + Web Push)  ← novo
 *  2. Email transacional (SES)                                ← legado
 *  3. WhatsApp (Twilio)                                       ← legado
 *
 * A regra de "para quem mandar" vive aqui — para cada cenário descrito
 * pelo produto (1–10), mapeamos qual lado (customer/provider) recebe
 * cada `NotificationType`. Isso desacopla o produtor (appointments
 * service) do destinatário.
 */
@Injectable()
export class MuralEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(MuralEventsConsumer.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly notifications: NotificationsService,
    private readonly whatsApp: WhatsAppService,
    private readonly inApp: InAppNotificationsService,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
  ) {}

  /**
   * Executa uma chamada de canal externo (email, WhatsApp, SNS) de
   * forma defensiva: se falhar (credenciais ausentes, rate limit,
   * timeout), apenas loga. Importante para não fazer o RabbitMQ
   * descartar a mensagem quando a notificação in-app já foi salva.
   */
  private async safeCall(
    channel: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(
        `Canal externo "${channel}" falhou (não bloqueia in-app): ${(err as Error).message}`,
      );
    }
  }

  async onModuleInit(): Promise<void> {
    await this.messagingService.consume(async (event: MuralEvents, payload) => {
      switch (event) {
        case MuralEvents.SERVICE_CREATED:
          await this.onServiceCreated(payload);
          break;

        case MuralEvents.APPOINTMENT_REQUESTED:
          await this.onAppointmentRequested(payload);
          break;

        case MuralEvents.APPOINTMENT_STATUS_CHANGED:
          await this.onAppointmentStatusChanged(payload);
          break;

        case MuralEvents.PAYMENT_FAILED:
          await this.onPaymentFailed(payload);
          break;

        case MuralEvents.APPOINTMENT_REMINDER:
          await this.onAppointmentReminder(payload);
          break;

        case MuralEvents.RESCHEDULE_REQUESTED:
          await this.onRescheduleRequested(payload);
          break;

        case MuralEvents.RESCHEDULE_ACCEPTED:
          await this.onRescheduleResponded(payload, true);
          break;

        case MuralEvents.RESCHEDULE_REJECTED:
          await this.onRescheduleResponded(payload, false);
          break;

        case MuralEvents.REVIEW_SUBMITTED:
          await this.onReviewSubmitted(payload);
          break;

        default:
          this.logger.warn(`Evento desconhecido recebido: ${event}`);
      }
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Constrói o payload "padrão" da notificação a partir do payload do
   * evento. Mantém estável o conjunto de chaves esperadas pelo frontend
   * para fazer i18n com placeholders.
   */
  private buildPayload(input: Record<string, unknown>): NotificationPayload {
    return {
      appointmentId: input.appointmentId as string | undefined,
      serviceId: input.serviceId as string | undefined,
      serviceName: input.serviceName as string | undefined,
      customerId: input.customerId as string | undefined,
      customerName: input.customerName as string | undefined,
      providerId: input.providerId as string | undefined,
      providerName: input.providerName as string | undefined,
      scheduledDate: input.scheduledDate as string | undefined,
      scheduledDay: input.scheduledDay as string | undefined,
      scheduledTime: input.scheduledTime as string | undefined,
      amount: input.amount as string | undefined,
      currency: input.currency as string | undefined,
      rating: input.rating as number | undefined,
    };
  }

  /**
   * Resolve `providerId` a partir do payload, com fallback via DB
   * quando o evento antigo não traz o campo (publicado antes da
   * refatoração). Faz lookup por `appointmentId` → service.providerId.
   */
  private async resolveProviderId(
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    if (payload.providerId) return payload.providerId as string;

    const appointmentId = payload.appointmentId as string | undefined;
    if (!appointmentId) return null;

    try {
      const appointment = await this.appointmentsRepo.findOne({
        where: { id: appointmentId },
        relations: ['service', 'service.provider'],
      });
      return appointment?.service?.provider?.id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve `customerId` com fallback via DB para eventos antigos.
   */
  private async resolveCustomerId(
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    if (payload.customerId) return payload.customerId as string;

    const appointmentId = payload.appointmentId as string | undefined;
    if (!appointmentId) return null;

    try {
      const appointment = await this.appointmentsRepo.findOne({
        where: { id: appointmentId },
        select: ['id', 'customerId'],
      });
      return appointment?.customerId ?? null;
    } catch {
      return null;
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  private async onServiceCreated(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { serviceName, providerName, condominiumId, category, price } =
      payload as {
        serviceName: string;
        providerName: string;
        condominiumId: string;
        category: string;
        price: string;
      };

    this.logger.log(
      `[service.created] "${serviceName}" publicado por "${providerName}" no condomínio ${condominiumId}.`,
    );

    // Notifica moradores do condomínio via SNS (canal externo legado).
    // Isolado em safeCall — se AWS estiver indisponível, o canal in-app
    // (próximo bloco) ainda completa.
    await this.safeCall('SNS (condomínio)', () =>
      this.notifications.notifyCondominiumResidents(
        condominiumId,
        `Novo serviço disponível: ${serviceName}`,
        [
          `${providerName} acabou de publicar um novo serviço no mural do seu condomínio!`,
          '',
          `📋 Serviço: ${serviceName}`,
          `🏷️  Categoria: ${category}`,
          `💰 Preço: ${price}`,
          '',
          'Acesse o Mural do Condomínio para ver mais detalhes e entrar em contato.',
        ].join('\n'),
      ),
    );

    // In-app: cria notificação para cada morador do condomínio.
    const residents = await this.usersRepo.find({
      where: { condominiumId },
      select: ['id'],
    });

    if (residents.length) {
      await this.inApp.createMany(
        residents.map((r) => ({
          recipientId: r.id,
          type: NotificationType.NEW_SERVICE_AVAILABLE,
          payload: {
            serviceName,
            providerName,
            category,
          },
        })),
      );
    }
  }

  /**
   * Cenário 1: morador agenda → notifica prestador (dono do serviço).
   */
  private async onAppointmentRequested(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const {
      appointmentId,
      serviceName,
      customerName,
      providerEmail,
      providerName,
      providerPhone,
      scheduledDate,
      scheduledDay,
      scheduledTime,
    } = payload as {
      appointmentId: string;
      serviceName: string;
      customerName: string;
      providerEmail: string;
      providerName: string;
      providerPhone: string;
      scheduledDate: string;
      scheduledDay: string;
      scheduledTime?: string;
    };

    this.logger.log(
      `[appointment.requested] "${customerName}" agendou "${serviceName}" para ${scheduledDate} (${scheduledDay}).`,
    );

    const providerId = await this.resolveProviderId(payload);

    // In-app para o prestador.
    if (providerId) {
      await this.inApp.create({
        recipientId: providerId,
        type: NotificationType.NEW_APPOINTMENT_REQUEST,
        payload: this.buildPayload(payload),
        actionUrl: `/mural/appointments?focus=${appointmentId}`,
      });
    }

    // E-mail (legado) — isolado para não derrubar o pipeline.
    if (providerEmail) {
      await this.safeCall('SES (appointment request)', () =>
        this.notifications.sendAppointmentRequestEmail(
          providerEmail,
          providerName,
          customerName,
          serviceName,
          scheduledDay,
          scheduledDate,
        ),
      );
    }

    // WhatsApp (legado) — idem.
    if (providerPhone) {
      await this.safeCall('WhatsApp (provider new appointment)', () =>
        this.whatsApp.notifyProviderNewAppointment({
          providerPhone,
          providerName,
          customerName,
          serviceName,
          scheduledDay,
          scheduledDate,
          scheduledTime,
        }),
      );
    }
  }

  /**
   * Despacha pelo `status` novo:
   *   confirmed  → cenário 2 (notifica customer)
   *   cancelled  → cenário 6 ou 7, depende do `actor`
   *   paid       → cenário 4 (notifica provider)
   *   completed  → cenário 10 (notifica customer + pede avaliação)
   */
  private async onAppointmentStatusChanged(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const {
      appointmentId,
      status,
      actor, // 'customer' | 'provider' | 'system' — quem disparou
      customerId,
      customerEmail,
      customerPhone,
      customerName,
      providerName,
      serviceName,
      scheduledDate,
      scheduledDay,
      scheduledTime,
    } = payload as {
      appointmentId: string;
      status: string;
      actor?: 'customer' | 'provider' | 'system';
      customerId?: string;
      customerEmail: string;
      customerPhone: string;
      customerName: string;
      providerName: string;
      serviceName: string;
      scheduledDate?: string;
      scheduledDay?: string;
      scheduledTime?: string;
    };

    this.logger.log(
      `[appointment.status_changed] ${appointmentId} → "${status}" (actor=${actor ?? 'unknown'}).`,
    );

    // Resolve com fallback via DB — cobre eventos antigos que não
    // traziam customerId/providerId no payload.
    const resolvedCustomerId =
      customerId ?? (await this.resolveCustomerId(payload));
    const providerId = await this.resolveProviderId(payload);
    const notifyPayload = this.buildPayload({
      ...payload,
      customerId: resolvedCustomerId,
      providerId,
    });
    const url = `/mural/appointments?focus=${appointmentId}`;

    switch (status) {
      // Cenário 2 — Prestador confirma
      case 'confirmed': {
        if (resolvedCustomerId) {
          await this.inApp.create({
            recipientId: resolvedCustomerId,
            type: NotificationType.APPOINTMENT_CONFIRMED,
            payload: notifyPayload,
            actionUrl: url,
          });
        }
        break;
      }

      // Cenário 4 — Pagamento confirmado
      case 'paid': {
        if (providerId) {
          await this.inApp.create({
            recipientId: providerId,
            type: NotificationType.PAYMENT_CONFIRMED,
            payload: notifyPayload,
            actionUrl: url,
          });
        }
        break;
      }

      // Cenários 6 e 7 — Cancelamento (depende do actor)
      case 'cancelled': {
        const cancelledByCustomer = actor === 'customer';
        if (cancelledByCustomer && providerId) {
          await this.inApp.create({
            recipientId: providerId,
            type: NotificationType.CUSTOMER_CANCELLED,
            payload: notifyPayload,
            actionUrl: url,
          });
        } else if (!cancelledByCustomer && resolvedCustomerId) {
          // Quando o prestador é o actor — OU quando não temos info do
          // actor mas a transição veio do endpoint /status (sempre
          // provider). Aqui assumimos provider quando actor != customer.
          await this.inApp.create({
            recipientId: resolvedCustomerId,
            type: NotificationType.PROVIDER_CANCELLED,
            payload: notifyPayload,
            actionUrl: url,
          });
        }
        break;
      }

      // Cenário 10 — Concluído (pede avaliação)
      case 'completed': {
        if (resolvedCustomerId) {
          await this.inApp.create({
            recipientId: resolvedCustomerId,
            type: NotificationType.APPOINTMENT_COMPLETED,
            payload: notifyPayload,
            actionUrl: `/mural/appointments?focus=${appointmentId}&review=1`,
          });
        }
        break;
      }

      // Cenário 3 já é tratado pelo cancellation com actor=provider
      // antes do confirm. Caso futuro de status 'rejected' explícito:
      case 'rejected': {
        if (resolvedCustomerId) {
          await this.inApp.create({
            recipientId: resolvedCustomerId,
            type: NotificationType.APPOINTMENT_REJECTED,
            payload: notifyPayload,
            actionUrl: url,
          });
        }
        break;
      }

      default:
        // awaiting_payment, etc — sem notificação dedicada por enquanto
        break;
    }

    // ── Canais externos legados (isolados em safeCall) ─────────────────────
    if (customerPhone) {
      await this.safeCall('WhatsApp (status change)', () =>
        status === 'paid'
          ? this.whatsApp.notifyCustomerPaymentConfirmed({
              customerPhone,
              customerName,
              serviceName,
              providerName,
              scheduledDay,
              scheduledDate,
              scheduledTime,
            })
          : this.whatsApp.notifyCustomerStatusChanged({
              customerPhone,
              customerName,
              serviceName,
              providerName,
              status,
              scheduledDay,
              scheduledDate,
              scheduledTime,
            }),
      );
    }

    const emailStatuses = ['confirmed', 'cancelled', 'completed'];
    if (customerEmail && emailStatuses.includes(status)) {
      const statusLabels: Record<string, string> = {
        confirmed: 'confirmado ✅',
        cancelled: 'cancelado ❌',
        completed: 'concluído 🎉',
      };
      const label = statusLabels[status] ?? status;

      await this.safeCall('SES (status change)', () =>
        this.notifications.sendEmail({
          to: [customerEmail],
          subject: `Seu agendamento foi ${label} — ${serviceName}`,
          bodyText: [
            `Olá, ${customerName}!`,
            '',
            `Seu agendamento para o serviço "${serviceName}" com ${providerName} foi ${label}.`,
            '',
            status === 'confirmed'
              ? 'O prestador confirmou o horário. Fique atento ao dia combinado!'
              : status === 'cancelled'
                ? 'Caso precise reagendar, acesse o Mural do Condomínio.'
                : 'Esperamos que o serviço tenha atendido suas expectativas. Não esqueça de avaliar!',
            '',
            '— Equipe Virtual Mural',
          ].join('\n'),
        }),
      );
    }
  }

  /**
   * Cenário 5 — Pagamento falhou.
   */
  private async onPaymentFailed(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { customerId, providerId } = payload as {
      customerId?: string;
      providerId?: string;
    };

    this.logger.log('[payment.failed] notificando partes envolvidas.');

    const notifyPayload = this.buildPayload(payload);
    const actionUrl = payload.appointmentId
      ? `/mural/appointments?focus=${payload.appointmentId}&retry-payment=1`
      : null;

    if (customerId) {
      await this.inApp.create({
        recipientId: customerId,
        type: NotificationType.PAYMENT_FAILED,
        payload: notifyPayload,
        actionUrl,
      });
    }

    // Opcional: avisar o prestador (cenário 5 menciona)
    if (providerId) {
      await this.inApp.create({
        recipientId: providerId,
        type: NotificationType.PAYMENT_PENDING_PROVIDER,
        payload: notifyPayload,
        actionUrl: payload.appointmentId
          ? `/mural/appointments?focus=${payload.appointmentId}`
          : null,
      });
    }
  }

  /**
   * Cenário 9 — Lembrete antes do horário (para ambos os lados).
   */
  private async onAppointmentReminder(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { customerId, providerId } = payload as {
      customerId?: string;
      providerId?: string;
    };

    const notifyPayload = this.buildPayload(payload);
    const actionUrl = payload.appointmentId
      ? `/mural/appointments?focus=${payload.appointmentId}`
      : null;

    const inputs = [];
    if (customerId) {
      inputs.push({
        recipientId: customerId,
        type: NotificationType.APPOINTMENT_REMINDER,
        payload: notifyPayload,
        actionUrl,
      });
    }
    if (providerId) {
      inputs.push({
        recipientId: providerId,
        type: NotificationType.APPOINTMENT_REMINDER,
        payload: notifyPayload,
        actionUrl,
      });
    }

    if (inputs.length) {
      await this.inApp.createMany(inputs);
    }
  }

  /**
   * Cenário 8 — Reagendamento solicitado por um lado.
   * `requesterRole` indica quem pediu; notificamos a CONTRAPARTE.
   */
  private async onRescheduleRequested(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { customerId, providerId, requesterRole } = payload as {
      customerId?: string;
      providerId?: string;
      requesterRole?: 'customer' | 'provider';
    };

    const recipient = requesterRole === 'customer' ? providerId : customerId;
    if (!recipient) return;

    await this.inApp.create({
      recipientId: recipient,
      type: NotificationType.RESCHEDULE_REQUESTED,
      payload: this.buildPayload(payload),
    });
  }

  /**
   * Cenário 8 — Resposta ao reagendamento (aceito/recusado).
   * `requesterRole` é quem PEDIU (recebe a notificação).
   */
  private async onRescheduleResponded(
    payload: Record<string, unknown>,
    accepted: boolean,
  ): Promise<void> {
    const { customerId, providerId, requesterRole } = payload as {
      customerId?: string;
      providerId?: string;
      requesterRole?: 'customer' | 'provider';
    };

    const recipient = requesterRole === 'customer' ? customerId : providerId;
    if (!recipient) return;

    await this.inApp.create({
      recipientId: recipient,
      type: accepted
        ? NotificationType.RESCHEDULE_ACCEPTED
        : NotificationType.RESCHEDULE_REJECTED,
      payload: this.buildPayload(payload),
    });
  }

  private async onReviewSubmitted(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { serviceName, authorName, providerEmail, providerName, rating } =
      payload as {
        serviceName: string;
        authorName: string;
        providerEmail: string;
        providerName: string;
        rating: number;
      };

    this.logger.log(
      `[review.submitted] "${authorName}" avaliou "${serviceName}" com nota ${rating}.`,
    );

    const providerId = await this.resolveProviderId(payload);
    if (providerId) {
      await this.inApp.create({
        recipientId: providerId,
        type: NotificationType.NEW_REVIEW,
        payload: this.buildPayload({ ...payload, customerName: authorName }),
      });
    }

    if (providerEmail) {
      await this.safeCall('SES (review)', () =>
        this.notifications.sendReviewNotificationEmail(
          providerEmail,
          providerName,
          authorName,
          serviceName,
          rating,
        ),
      );
    }
  }
}
