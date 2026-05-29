import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingService } from './messaging.service';
import { MuralEventsConsumer } from './consumers/mural-events.consumer';
import { DeadLetterQueueConsumer } from './consumers/dead-letter-queue.consumer';
import { NotificationsModule } from '../notifications/notifications.module';
import { User } from '../users/entities/user.entity';
import { Appointment } from '../appointments/entities/appointment.entity';

/**
 * MessagingModule
 *
 * Importa o NotificationsModule (canais in-app, push, email, WhatsApp)
 * e injeta o repositório de User + Appointment para que o consumer
 * possa enumerar moradores de um condomínio (SERVICE_CREATED) e
 * resolver providerId/customerId via DB quando eventos antigos
 * (publicados antes da refatoração) chegarem sem esses campos.
 *
 * DeadLetterQueueConsumer monitora a DLQ e alerta via Sentry quando
 * mensagens são descartadas após esgotarem as tentativas de retry.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, Appointment]), NotificationsModule],
  providers: [MessagingService, MuralEventsConsumer, DeadLetterQueueConsumer],
  exports: [MessagingService],
})
export class MessagingModule {}
