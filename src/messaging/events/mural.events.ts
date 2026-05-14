/**
 * Catálogo de eventos publicados no RabbitMQ pelo Virtual Mural.
 *
 * Padrão de nomenclatura: <domínio>.<ação>
 * Todos os eventos são roteados pela exchange padrão (direct) para a fila
 * configurada em RABBITMQ_QUEUE.
 */
export enum MuralEvents {
  /** Publicado quando um prestador cria um novo serviço no mural. */
  SERVICE_CREATED = 'service.created',

  /** Publicado quando um morador solicita um agendamento. */
  APPOINTMENT_REQUESTED = 'appointment.requested',

  /**
   * Publicado quando o status do agendamento muda (confirmed, cancelled,
   * paid, completed, etc). O payload carrega o `status` novo + `actor`
   * indicando se a mudança veio do customer ou do provider — usado para
   * decidir para QUEM mandar a notificação.
   */
  APPOINTMENT_STATUS_CHANGED = 'appointment.status_changed',

  /** Publicado quando o gateway de pagamento informa falha. */
  PAYMENT_FAILED = 'payment.failed',

  /**
   * Publicado quando faltam X horas para um agendamento confirmado/pago.
   * Disparado pelo cron `AppointmentReminderScheduler`.
   */
  APPOINTMENT_REMINDER = 'appointment.reminder',

  /** Reagendamento solicitado por um dos lados. */
  RESCHEDULE_REQUESTED = 'appointment.reschedule_requested',
  /** Reagendamento aceito pela contraparte. */
  RESCHEDULE_ACCEPTED = 'appointment.reschedule_accepted',
  /** Reagendamento recusado pela contraparte. */
  RESCHEDULE_REJECTED = 'appointment.reschedule_rejected',

  /** Publicado quando um morador envia uma avaliação. */
  REVIEW_SUBMITTED = 'review.submitted',
}
