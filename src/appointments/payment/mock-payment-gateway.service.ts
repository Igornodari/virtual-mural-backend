import { Injectable } from '@nestjs/common';
import { IPaymentGateway, CheckoutSessionStatus } from './payment-gateway.interface';
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

  retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionStatus> {
    // Mock: extrai appointmentId do sessionId no formato "mock-{appointmentId}-{timestamp}"
    const parts = sessionId.replace('mock-', '').split('-');
    const appointmentId = parts.length >= 5 ? parts.slice(0, 5).join('-') : null;
    return Promise.resolve({
      appointmentId,
      paymentStatus: 'paid',
    });
  }
}
