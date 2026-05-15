import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingService } from './messaging.service';
import { MuralEventsConsumer } from './consumers/mural-events.consumer';
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
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, Appointment]), NotificationsModule],
  providers: [MessagingService, MuralEventsConsumer],
  exports: [MessagingService],
})
export class MessagingModule {}
