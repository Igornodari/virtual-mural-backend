import { Appointment } from '../entities/appointment.entity';
import { AppointmentPaymentResult } from '../dto/create-appointment-payment.dto';

/** Resultado de um pedido de estorno ao provedor. */
export interface RefundResult {
  /** Identificador do estorno no provedor. */
  refundId: string;
  /** Valor estornado, em centavos. */
  amountCents: number;
}

export interface IPaymentGateway {
  createPayment(
    appointment: Appointment,
    method: 'pix' | 'credit_card',
    /** ID da conta Stripe Connect do prestador (opcional — usa split de 5% quando fornecido) */
    providerStripeAccountId?: string | null,
  ): Promise<AppointmentPaymentResult>;

  /**
   * Estorna integralmente um pagamento já confirmado.
   *
   * Em cobrança com destino, o estorno precisa reverter também a
   * transferência ao prestador e a taxa da plataforma — senão a plataforma
   * devolve do próprio bolso e quem recebeu fica com o dinheiro.
   */
  refundPayment(externalPaymentId: string): Promise<RefundResult>;
}
