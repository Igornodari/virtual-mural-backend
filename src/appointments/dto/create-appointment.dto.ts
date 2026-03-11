import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  serviceId: string;

  @ApiProperty({ example: '2026-04-15', description: 'Data do agendamento (YYYY-MM-DD)' })
  @IsDateString()
  scheduledDate: string;

  @ApiProperty({ example: 'Terça-feira', description: 'Dia da semana escolhido' })
  @IsString()
  @IsNotEmpty()
  scheduledDay: string;

  @ApiPropertyOptional({ example: 'Preciso trocar o sifão da pia da cozinha.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
