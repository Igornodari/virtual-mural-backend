import { Appointment } from '../entities/appointment.entity';
import { AppointmentPaymentResult } from '../dto/create-appointment-payment.dto';

export interface CheckoutSessionStatus {
  appointmentId: string | null;
  paymentStatus: string; // 'paid' | 'unpaid' | 'no_payment_required'
}

export interface IPaymentGateway {
  createPayment(
    appointment: Appointment,
    method: 'pix' | 'credit_card',
  ): Promise<AppointmentPaymentResult>;

  retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionStatus>;
}
