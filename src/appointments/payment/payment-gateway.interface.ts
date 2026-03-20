import { Appointment } from '../entities/appointment.entity';
import { AppointmentPaymentResult } from '../dto/create-appointment-payment.dto';

export interface IPaymentGateway {
  createPayment(
    appointment: Appointment,
    method: 'pix' | 'credit_card',
  ): Promise<AppointmentPaymentResult>;
}
