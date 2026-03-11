import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '../messaging.service';
import { MuralEvents } from '../events/mural.events';

/**
 * Consumidor de eventos do Mural Virtual.
 *
 * Este serviço escuta a fila RabbitMQ e reage a cada evento publicado.
 * Em produção, aqui você integraria com serviços de notificação (SNS, SES,
 * push notifications, WebSockets, etc.).
 */
@Injectable()
export class MuralEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(MuralEventsConsumer.name);

  constructor(private readonly messagingService: MessagingService) {}

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

  /**
   * Novo serviço publicado no mural.
   * TODO: Notificar todos os moradores do condomínio (SNS/SES/Push).
   */
  private async onServiceCreated(payload: Record<string, unknown>): Promise<void> {
    this.logger.log(
      `[service.created] Novo serviço "${payload['serviceName']}" ` +
        `publicado por "${payload['providerName']}" no condomínio ${payload['condominiumId']}.`,
    );
    // Exemplo de integração futura:
    // await this.notificationService.notifyCondominiumResidents(payload.condominiumId, {
    //   title: 'Novo serviço disponível!',
    //   body: `${payload.providerName} oferece: ${payload.serviceName}`,
    // });
  }

  /**
   * Novo agendamento solicitado por um morador.
   * TODO: Notificar o prestador de serviço.
   */
  private async onAppointmentRequested(payload: Record<string, unknown>): Promise<void> {
    this.logger.log(
      `[appointment.requested] "${payload['customerName']}" agendou o serviço ` +
        `${payload['serviceId']} para ${payload['scheduledDate']} (${payload['scheduledDay']}).`,
    );
    // Exemplo de integração futura:
    // await this.notificationService.notifyProvider(payload.serviceId, {
    //   title: 'Novo agendamento!',
    //   body: `${payload.customerName} quer agendar para ${payload.scheduledDay}.`,
    // });
  }

  /**
   * Status de um agendamento alterado.
   * TODO: Notificar o morador sobre confirmação ou cancelamento.
   */
  private async onAppointmentStatusChanged(payload: Record<string, unknown>): Promise<void> {
    this.logger.log(
      `[appointment.status_changed] Agendamento ${payload['appointmentId']} ` +
        `alterado para "${payload['status']}".`,
    );
  }

  /**
   * Nova avaliação enviada por um morador.
   * TODO: Notificar o prestador sobre a nova avaliação.
   */
  private async onReviewSubmitted(payload: Record<string, unknown>): Promise<void> {
    this.logger.log(
      `[review.submitted] "${payload['authorName']}" avaliou o serviço ` +
        `${payload['serviceId']} com nota ${payload['rating']}.`,
    );
  }
}
