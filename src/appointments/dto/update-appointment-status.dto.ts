import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import type { AppointmentStatus } from '../entities/appointment.entity';

export class UpdateAppointmentStatusDto {
  @ApiProperty({
    enum: [
      'pending',
      'confirmed',
      'awaiting_payment',
      'paid',
      'cancelled',
      'completed',
    ],
  })
  @IsEnum([
    'pending',
    'confirmed',
    'awaiting_payment',
    'paid',
    'cancelled',
    'completed',
  ])
  status: AppointmentStatus;
}
