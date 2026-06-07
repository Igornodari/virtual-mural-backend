import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '../messaging/messaging.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([]), // Necessário para injetar DataSource via @InjectDataSource
    MessagingModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
