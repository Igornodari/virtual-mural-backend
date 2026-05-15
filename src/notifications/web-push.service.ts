import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { PushSubscription } from './entities/push-subscription.entity';
import {
  Notification,
  NotificationType,
  NotificationPayload,
  NotificationSeverity,
} from './entities/notification.entity';

/**
 * Payload enviado ao Service Worker do navegador. O SW lê `type`/`vars`
 * e resolve a tradução localmente (mesmo dicionário i18n do app).
 *
 * `severity` afeta a presença de vibração / ícone diferente.
 */
export interface WebPushPayload {
  type: NotificationType;
  severity: NotificationSeverity;
  vars: NotificationPayload;
  actionUrl: string | null;
  notificationId: string;
}

/**
 * Envia notificações push para dispositivos inscritos via Web Push
 * Protocol (RFC 8030) usando VAPID. Cada usuário pode ter N
 * subscriptions (1 por device/browser).
 *
 * VAPID keys devem ser geradas uma única vez por ambiente:
 *   npx web-push generate-vapid-keys
 * E configuradas em:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
 *
 * Subscriptions que retornarem 404/410 são removidas automaticamente.
 */
@Injectable()
export class WebPushService implements OnModuleInit {
  private readonly logger = new Logger(WebPushService.name);
  private isConfigured = false;

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subsRepo: Repository<PushSubscription>,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>(
      'VAPID_SUBJECT',
      'mailto:noreply@virtual-mural.com',
    );

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID keys ausentes (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY). ' +
          'Web Push DESATIVADO. Notificações continuam funcionando in-app.',
      );
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.isConfigured = true;
    this.logger.log('✅ Web Push configurado com VAPID.');
  }

  /**
   * Salva (ou atualiza) uma subscription para um usuário.
   *
   * O `endpoint` é único globalmente — se outro usuário tinha o mesmo
   * endpoint (ex.: mesmo navegador, conta diferente), atualizamos o
   * dono. Isso evita push cruzado em devices compartilhados.
   */
  async registerSubscription(params: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string;
  }): Promise<PushSubscription> {
    const existing = await this.subsRepo.findOne({
      where: { endpoint: params.endpoint },
    });

    if (existing) {
      existing.userId = params.userId;
      existing.p256dh = params.p256dh;
      existing.auth = params.auth;
      existing.userAgent = params.userAgent ?? existing.userAgent;
      return this.subsRepo.save(existing);
    }

    const created = this.subsRepo.create({
      userId: params.userId,
      endpoint: params.endpoint,
      p256dh: params.p256dh,
      auth: params.auth,
      userAgent: params.userAgent ?? null,
    });
    return this.subsRepo.save(created);
  }

  async removeSubscriptionByEndpoint(endpoint: string): Promise<void> {
    await this.subsRepo.delete({ endpoint });
  }

  /**
   * Envia o payload para TODAS as subscriptions do usuário.
   * Falhas individuais (sub inválida, navegador offline) NÃO interrompem
   * o fluxo — o método sempre resolve, apenas logando os erros.
   */
  async sendToUser(
    userId: string,
    notification: Notification,
  ): Promise<void> {
    if (!this.isConfigured) {
      return;
    }

    const subs = await this.subsRepo.find({ where: { userId } });
    if (!subs.length) {
      return;
    }

    const body: WebPushPayload = {
      type: notification.type,
      severity: notification.severity,
      vars: notification.payload,
      actionUrl: notification.actionUrl,
      notificationId: notification.id,
    };

    const serialized = JSON.stringify(body);

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            serialized,
            {
              TTL: 60 * 60 * 24, // 1 dia
              urgency: notification.severity === 'error' ? 'high' : 'normal',
            },
          );
        } catch (err: unknown) {
          await this.handleSendError(sub, err);
        }
      }),
    );
  }

  /**
   * Status 404/410 → endpoint expirado, remover subscription.
   * Outros erros → log e segue em frente.
   */
  private async handleSendError(
    sub: PushSubscription,
    err: unknown,
  ): Promise<void> {
    const statusCode =
      typeof err === 'object' && err !== null && 'statusCode' in err
        ? (err as { statusCode?: number }).statusCode
        : undefined;

    if (statusCode === 404 || statusCode === 410) {
      this.logger.debug(
        `Subscription expirada (${statusCode}). Removendo endpoint=${sub.endpoint.slice(0, 60)}...`,
      );
      await this.subsRepo.delete({ id: sub.id });
      return;
    }

    this.logger.warn(
      `Falha ao enviar push (sub ${sub.id}): ${(err as Error).message}`,
    );
  }
}
