import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { WhatsAppService } from './whatsapp.service';
import { InAppNotificationsService } from './in-app-notifications.service';
import { WebPushService } from './web-push.service';
import { NotificationsController } from './notifications.controller';
import { Notification } from './entities/notification.entity';
import { PushSubscription } from './entities/push-subscription.entity';

/**
 * Módulo de notificações do Virtual Mural.
 *
 * Canais cobertos:
 *  - In-app (DB + SSE)        → InAppNotificationsService
 *  - Web Push (VAPID)         → WebPushService
 *  - Email (AWS SES)          → NotificationsService (legado, mantido)
 *  - WhatsApp (Twilio)        → WhatsAppService (legado, mantido)
 *
 * O consumer de eventos do mural (MuralEventsConsumer) importa este
 * módulo e dispara todos os canais conforme o tipo de evento.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Notification, PushSubscription])],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    WhatsAppService,
    InAppNotificationsService,
    WebPushService,
  ],
  exports: [
    NotificationsService,
    WhatsAppService,
    InAppNotificationsService,
    WebPushService,
  ],
})
export class NotificationsModule {}
