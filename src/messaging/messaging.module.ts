import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MuralEventsConsumer } from './consumers/mural-events.consumer';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [MessagingService, MuralEventsConsumer],
  exports: [MessagingService],
})
export class MessagingModule {}
