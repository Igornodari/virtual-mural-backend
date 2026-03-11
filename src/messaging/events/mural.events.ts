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

  /** Publicado quando o prestador confirma ou cancela um agendamento. */
  APPOINTMENT_STATUS_CHANGED = 'appointment.status_changed',

  /** Publicado quando um morador envia uma avaliação. */
  REVIEW_SUBMITTED = 'review.submitted',
}
