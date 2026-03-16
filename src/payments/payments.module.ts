import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Appointment } from '../appointments/entities/appointment.entity';
import { StripeService } from './stripe.service';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Appointment])],
  providers: [StripeService, PaymentsService],
  controllers: [PaymentsController],
  exports: [StripeService, PaymentsService],
})
export class PaymentsModule {}
