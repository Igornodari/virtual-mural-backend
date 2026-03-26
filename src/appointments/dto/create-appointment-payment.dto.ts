import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

type PaymentMethod = 'pix' | 'credit_card';

export class CreateAppointmentPaymentDto {
  @ApiProperty({ enum: ['pix', 'credit_card'] })
  @IsEnum(['pix', 'credit_card'])
  method: PaymentMethod;
}

export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed';

export interface AppointmentPaymentResult {
  paymentId: string;
  paymentStatus: PaymentStatus;
  checkoutUrl?: string;
  checkoutSessionId?: string;
  qrCode?: string;
  qrCodeText?: string;
}
