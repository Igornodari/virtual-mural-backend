import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MuralEventsConsumer } from './consumers/mural-events.consumer';

@Module({
  providers: [MessagingService, MuralEventsConsumer],
  exports: [MessagingService],
})
export class MessagingModule {}
