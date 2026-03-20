import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
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
      'Segunda',
      'Terca',
      'Quarta',
      'Quinta',
      'Sexta',
      'Sabado',
      'Domingo',
    ],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado', 'Domingo'])
  scheduledDay: string;

  @ApiPropertyOptional({ example: 'Preciso trocar o sifão da pia da cozinha.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
