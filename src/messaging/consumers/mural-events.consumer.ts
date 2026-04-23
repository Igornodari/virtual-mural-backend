import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '../messaging.service';
import { MuralEvents } from '../events/mural.events';
import { NotificationsService } from '../../notifications/notifications.service';
import { WhatsAppService } from '../../notifications/whatsapp.service';

/**
 * Consumidor de eventos do Mural Virtual.
 *
 * Escuta a fila RabbitMQ e aciona notificações via:
 *  - AWS SES   → e-mails transacionais
 *  - Twilio    → WhatsApp para cliente e prestador
 */
@Injectable()
export class MuralEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(MuralEventsConsumer.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly notifications: NotificationsService,
    private readonly whatsApp: WhatsAppService,
  ) {}

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

        case MuralEvents.REVIEW_SUBMITTED:
          await this.onReviewSubmitted(payload);
          break;

        default:
          this.logger.warn(`Evento desconhecido recebido: ${event}`);
      }
    });
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

    await this.notifications.notifyCondominiumResidents(
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
    );
  }

  /**
   * Novo agendamento solicitado pelo cliente.
   * → E-mail para o prestador
   * → WhatsApp para o prestador
   */
  private async onAppointmentRequested(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const {
      serviceName,
      customerName,
      customerPhone: _customerPhone,
      providerEmail,
      providerName,
      providerPhone,
      scheduledDate,
      scheduledDay,
      scheduledTime,
    } = payload as {
      serviceName: string;
      customerName: string;
      customerPhone: string;
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

    // E-mail para o prestador
    if (providerEmail) {
      await this.notifications.sendAppointmentRequestEmail(
        providerEmail,
        providerName,
        customerName,
        serviceName,
        scheduledDay,
        scheduledDate,
      );
    }

    // WhatsApp para o prestador
    if (providerPhone) {
      await this.whatsApp.notifyProviderNewAppointment({
        providerPhone,
        providerName,
        customerName,
        serviceName,
        scheduledDay,
        scheduledDate,
        scheduledTime,
      });
    }
  }

  /**
   * Status de agendamento alterado.
   * → E-mail para o cliente
   * → WhatsApp para o cliente
   *
   * Statuses tratados: confirmed, cancelled, completed, awaiting_payment, paid
   */
  private async onAppointmentStatusChanged(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const {
      appointmentId,
      status,
      serviceName,
      customerEmail,
      customerPhone,
      customerName,
      providerName,
      scheduledDate,
      scheduledDay,
      scheduledTime,
    } = payload as {
      appointmentId: string;
      status: string;
      serviceName: string;
      customerEmail: string;
      customerPhone: string;
      customerName: string;
      providerName: string;
      scheduledDate?: string;
      scheduledDay?: string;
      scheduledTime?: string;
    };

    this.logger.log(
      `[appointment.status_changed] Agendamento ${appointmentId} → "${status}".`,
    );

    // ── WhatsApp para o cliente ──────────────────────────────────────────────
    if (customerPhone) {
      if (status === 'paid') {
        // Status 'paid' tem mensagem específica de confirmação de pagamento
        await this.whatsApp.notifyCustomerPaymentConfirmed({
          customerPhone,
          customerName,
          serviceName,
          providerName,
          scheduledDay,
          scheduledDate,
          scheduledTime,
        });
      } else {
        await this.whatsApp.notifyCustomerStatusChanged({
          customerPhone,
          customerName,
          serviceName,
          providerName,
          status,
          scheduledDay,
          scheduledDate,
          scheduledTime,
        });
      }
    }

    // ── E-mail para o cliente (apenas statuses relevantes) ───────────────────
    const emailStatuses = ['confirmed', 'cancelled', 'completed'];
    if (customerEmail && emailStatuses.includes(status)) {
      const statusLabels: Record<string, string> = {
        confirmed: 'confirmado ✅',
        cancelled: 'cancelado ❌',
        completed: 'concluído 🎉',
      };
      const label = statusLabels[status] ?? status;

      await this.notifications.sendEmail({
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
      });
    }
  }

  /**
   * Nova avaliação enviada pelo cliente.
   * → E-mail para o prestador
   */
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

    if (providerEmail) {
      await this.notifications.sendReviewNotificationEmail(
        providerEmail,
        providerName,
        authorName,
        serviceName,
        rating,
      );
    }
  }
}
