import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '../messaging.service';
import { MuralEvents } from '../events/mural.events';
import { NotificationsService } from '../../notifications/notifications.service';

/**
 * Consumidor de eventos do Mural Virtual.
 *
 * Escuta a fila RabbitMQ e aciona notificações reais via AWS SNS e SES
 * para cada evento relevante do sistema.
 *
 * Fluxo:
 *   RabbitMQ queue → MuralEventsConsumer → NotificationsService → SNS / SES
 */
@Injectable()
export class MuralEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(MuralEventsConsumer.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.messagingService.consume(async (event, payload) => {
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

  /**
   * Novo serviço publicado no mural.
   * Notifica todos os moradores do condomínio via SNS.
   *
   * Payload esperado:
   *   { serviceId, serviceName, providerName, condominiumId, category, price }
   */
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
      `[service.created] "${serviceName}" publicado por "${providerName}" ` +
        `no condomínio ${condominiumId}.`,
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
   * Novo agendamento solicitado por um morador.
   * Notifica o prestador via SES (e-mail direto).
   *
   * Payload esperado:
   *   { appointmentId, serviceId, serviceName, customerId, customerName,
   *     providerEmail, providerName, scheduledDate, scheduledDay }
   */
  private async onAppointmentRequested(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const {
      serviceName,
      customerName,
      providerEmail,
      providerName,
      scheduledDate,
      scheduledDay,
    } = payload as {
      serviceName: string;
      customerName: string;
      providerEmail: string;
      providerName: string;
      scheduledDate: string;
      scheduledDay: string;
    };

    this.logger.log(
      `[appointment.requested] "${customerName}" agendou "${serviceName}" ` +
        `para ${scheduledDate} (${scheduledDay}).`,
    );

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
  }

  /**
   * Status de um agendamento alterado (confirmado, cancelado, concluído).
   * Notifica o morador via SES.
   *
   * Payload esperado:
   *   { appointmentId, status, serviceName, customerEmail, customerName, providerName }
   */
  private async onAppointmentStatusChanged(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const {
      appointmentId,
      status,
      serviceName,
      customerEmail,
      customerName,
      providerName,
    } = payload as {
      appointmentId: string;
      status: string;
      serviceName: string;
      customerEmail: string;
      customerName: string;
      providerName: string;
    };

    this.logger.log(
      `[appointment.status_changed] Agendamento ${appointmentId} → "${status}".`,
    );

    const statusLabels: Record<string, string> = {
      confirmed: 'confirmado ✅',
      cancelled: 'cancelado ❌',
      completed: 'concluído 🎉',
    };
    const label = statusLabels[status] ?? status;

    if (customerEmail) {
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
   * Nova avaliação enviada por um morador.
   * Notifica o prestador via SES.
   *
   * Payload esperado:
   *   { reviewId, serviceId, serviceName, authorName, providerEmail,
   *     providerName, rating, comment }
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
