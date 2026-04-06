import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';
import { TimeBlock } from './entities/time-block.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TimeBlock])],
  controllers: [ScheduleController],
  providers: [ScheduleService],
})
export class ScheduleModule {}
