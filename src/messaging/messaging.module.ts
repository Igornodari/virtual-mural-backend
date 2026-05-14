import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingService } from './messaging.service';
import { MuralEventsConsumer } from './consumers/mural-events.consumer';
import { NotificationsModule } from '../notifications/notifications.module';
import { User } from '../users/entities/user.entity';

/**
 * MessagingModule
 *
 * Importa o NotificationsModule (canais in-app, push, email, WhatsApp)
 * e injeta o repositório de User para que o consumer possa enumerar
 * moradores de um condomínio ao notificar eventos em massa
 * (ex.: SERVICE_CREATED).
 */
@Module({
  imports: [TypeOrmModule.forFeature([User]), NotificationsModule],
  providers: [MessagingService, MuralEventsConsumer],
  exports: [MessagingService],
})
export class MessagingModule {}
