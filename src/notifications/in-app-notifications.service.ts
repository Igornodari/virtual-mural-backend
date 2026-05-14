import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject, Observable, filter, map } from 'rxjs';
import {
  Notification,
  NotificationPayload,
  NotificationSeverity,
  NotificationType,
} from './entities/notification.entity';
import { WebPushService } from './web-push.service';

export interface CreateNotificationInput {
  recipientId: string;
  type: NotificationType;
  payload: NotificationPayload;
  severity?: NotificationSeverity;
  actionUrl?: string | null;
}

export interface NotificationStreamEvent {
  recipientId: string;
  notification: Notification;
}

/**
 * Serviço de notificações in-app (DB) + Web Push + Stream SSE.
 *
 * Fluxo padrão:
 *  1. `create` → persiste no Postgres
 *  2. Dispara Web Push (best-effort, não bloqueia)
 *  3. Emite no stream para SSE entregar em tempo real ao app aberto
 *
 * Mantemos o `NotificationsService` (AWS SES/SNS) e `WhatsAppService`
 * separados — eles são canais EXTERNOS chamados pelo consumer de
 * eventos. Este service cuida do CANAL IN-APP.
 */
@Injectable()
export class InAppNotificationsService {
  private readonly logger = new Logger(InAppNotificationsService.name);

  /**
   * Stream global de notificações criadas. O controller SSE filtra
   * por `recipientId` para entregar só ao usuário certo.
   *
   * Usamos um Subject simples (in-process). Em deploy multi-instância
   * seria necessário Redis Pub/Sub ou similar; para o app atual isso
   * resolve. Migração futura é trivial.
   */
  private readonly stream$ = new Subject<NotificationStreamEvent>();

  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepo: Repository<Notification>,
    private readonly webPush: WebPushService,
  ) {}

  /**
   * Cria uma notificação para um destinatário. Não lança em caso de
   * falha do push — o canal in-app é a fonte de verdade.
   */
  async create(input: CreateNotificationInput): Promise<Notification> {
    const entity = this.notificationsRepo.create({
      recipientId: input.recipientId,
      type: input.type,
      payload: input.payload ?? {},
      severity: input.severity ?? this.defaultSeverity(input.type),
      actionUrl: input.actionUrl ?? this.defaultActionUrl(input),
      read: false,
    });

    const saved = await this.notificationsRepo.save(entity);

    this.logger.debug(
      `🔔 Notificação criada: id=${saved.id} type=${saved.type} → user=${saved.recipientId}`,
    );

    // Emite no stream antes do push para que o app aberto tenha a
    // notificação imediatamente (push é uma garantia EXTRA caso o app
    // esteja fechado/em background).
    this.stream$.next({ recipientId: saved.recipientId, notification: saved });

    // Dispara push em background (não aguarda — não queremos travar
    // o fluxo de webhook do Stripe ou similar caso o push service
    // esteja lento).
    void this.webPush
      .sendToUser(saved.recipientId, saved)
      .catch((err: Error) =>
        this.logger.warn(`Falha no Web Push: ${err.message}`),
      );

    return saved;
  }

  async createMany(inputs: CreateNotificationInput[]): Promise<Notification[]> {
    const results: Notification[] = [];
    for (const input of inputs) {
      results.push(await this.create(input));
    }
    return results;
  }

  async findForUser(
    userId: string,
    options: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
  ): Promise<{ items: Notification[]; total: number; unread: number }> {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;

    const qb = this.notificationsRepo
      .createQueryBuilder('n')
      .where('n.recipientId = :userId', { userId });

    if (options.unreadOnly) {
      qb.andWhere('n.read = false');
    }

    const [items, total] = await qb
      .orderBy('n.createdAt', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    const unread = await this.unreadCount(userId);

    return { items, total, unread };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notificationsRepo.count({
      where: { recipientId: userId, read: false },
    });
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationsRepo.findOne({
      where: { id, recipientId: userId },
    });

    if (!notification) {
      throw new NotFoundException(`Notificação ${id} não encontrada.`);
    }

    if (notification.read) {
      return notification;
    }

    notification.read = true;
    notification.readAt = new Date();
    return this.notificationsRepo.save(notification);
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationsRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ read: true, readAt: () => 'NOW()' })
      .where('recipientId = :userId AND read = false', { userId })
      .execute();

    return { updated: result.affected ?? 0 };
  }

  /**
   * Stream filtrado por usuário, usado pelo controller SSE.
   */
  streamForUser(userId: string): Observable<Notification> {
    return this.stream$.pipe(
      filter((event) => event.recipientId === userId),
      map((event) => event.notification),
    );
  }

  // ── Defaults ─────────────────────────────────────────────────────────────

  private defaultSeverity(type: NotificationType): NotificationSeverity {
    switch (type) {
      case NotificationType.APPOINTMENT_CONFIRMED:
      case NotificationType.PAYMENT_CONFIRMED:
      case NotificationType.APPOINTMENT_COMPLETED:
      case NotificationType.RESCHEDULE_ACCEPTED:
        return 'success';

      case NotificationType.APPOINTMENT_REJECTED:
      case NotificationType.PROVIDER_CANCELLED:
      case NotificationType.CUSTOMER_CANCELLED:
      case NotificationType.RESCHEDULE_REJECTED:
        return 'warning';

      case NotificationType.PAYMENT_FAILED:
        return 'error';

      default:
        return 'info';
    }
  }

  /**
   * Resolve o `actionUrl` padrão baseado no tipo, para que o clique
   * leve a uma tela útil quando o produtor da notificação não setou
   * explicitamente. Usa convenção do frontend: rotas /mural/...
   */
  private defaultActionUrl(input: CreateNotificationInput): string | null {
    if (input.actionUrl !== undefined) {
      return input.actionUrl;
    }

    const appointmentId = input.payload?.appointmentId;
    if (appointmentId) {
      return `/mural/appointments?focus=${appointmentId}`;
    }

    const serviceId = input.payload?.serviceId;
    if (
      serviceId &&
      input.type === NotificationType.NEW_SERVICE_AVAILABLE
    ) {
      return `/mural/customer?service=${serviceId}`;
    }

    return null;
  }
}
