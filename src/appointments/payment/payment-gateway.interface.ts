import { Appointment } from '../entities/appointment.entity';
import { AppointmentPaymentResult } from '../dto/create-appointment-payment.dto';

export interface IPaymentGateway {
  createPayment(
    appointment: Appointment,
    method: 'pix' | 'credit_card',
    /** ID da conta Stripe Connect do prestador (opcional — usa split de 5% quando fornecido) */
    providerStripeAccountId?: string | null,
  ): Promise<AppointmentPaymentResult>;
}
