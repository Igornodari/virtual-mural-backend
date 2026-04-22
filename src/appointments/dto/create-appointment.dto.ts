import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  serviceId: string;

  @ApiProperty({
    example: '2026-04-15',
    description: 'Data do agendamento (YYYY-MM-DD)',
  })
  @IsDateString()
  scheduledDate: string;

  @ApiProperty({
    example: 'Terca',
    description: 'Dia da semana escolhido',
    enum: [
      'Segunda-feira',
      'Terça-feira',
      'Quarta-feira',
      'Quinta-feira',
      'Sexta-feira',
      'Sábado',
      'Domingo',
    ],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn([
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
    'Domingo',
  ])
  scheduledDay: string;

  @ApiPropertyOptional({
    example: '09:00',
    description: 'Horário agendado (HH:mm)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'scheduledTime deve estar no formato HH:mm' })
  scheduledTime?: string;

  @ApiPropertyOptional({ example: 'Preciso trocar o sifão da pia da cozinha.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
