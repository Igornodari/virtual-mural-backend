import { Injectable } from '@nestjs/common';
import { IPaymentGateway } from './payment-gateway.interface';
import { Appointment } from '../entities/appointment.entity';
import { AppointmentPaymentResult } from '../dto/create-appointment-payment.dto';

@Injectable()
export class MockPaymentGatewayService implements IPaymentGateway {
  createPayment(
    appointment: Appointment,
    method: 'pix' | 'credit_card',
  ): Promise<AppointmentPaymentResult> {
    const paymentId = `mock-${appointment.id}-${Date.now()}`;

    if (method === 'pix') {
      return Promise.resolve({
        paymentId,
        paymentStatus: 'pending',
        qrCode: `QRCode://pix/${paymentId}`,
        qrCodeText: `PIX ${paymentId}`,
      });
    }

    // credit card: assume immediate success in mock
    return Promise.resolve({
      paymentId,
      paymentStatus: 'paid',
      checkoutUrl: `https://mock-checkout.example.com/${paymentId}`,
    });
  }
}
