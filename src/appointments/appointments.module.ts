import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from './entities/appointment.entity';
import { Payment } from './entities/payment.entity';
import { Service } from '../services/entities/service.entity';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { StripePaymentGatewayService } from './payment/stripe-payment-gateway.service';
import { MockPaymentGatewayService } from './payment/mock-payment-gateway.service';
import { StripeWebhooksController } from './webhooks/stripe-webhooks.controller';
import { MessagingModule } from '../messaging/messaging.module';
import { StripeConnectModule } from '../stripe-connect/stripe-connect.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, Payment, Service]),
    MessagingModule,
    StripeConnectModule,
  ],
  controllers: [AppointmentsController, StripeWebhooksController],
  providers: [
    AppointmentsService,
    {
      provide: 'PAYMENT_GATEWAY',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const gateway = config.get<string>('PAYMENT_GATEWAY_PROVIDER', 'mock');

        if (gateway === 'stripe') {
          return new StripePaymentGatewayService(config);
        }

        return new MockPaymentGatewayService();
      },
    },
  ],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
