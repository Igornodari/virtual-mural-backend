import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AvailabilitySlotDto } from './availability-slot.dto';

export class CreateServiceDto {
  @ApiProperty({ example: 'Encanamento Residencial' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: 'Conserto de vazamentos, instalação de torneiras e tubulações.',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 'A partir de R$ 80,00' })
  @IsString()
  @IsNotEmpty()
  price: string;

  @ApiProperty({ example: '(11) 99999-0000' })
  @IsString()
  @IsNotEmpty()
  contact: string;

  @ApiProperty({ example: 'Manutenção' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({
    example: ['Segunda-feira', 'Terça-feira'],
    description:
      'Dias da semana disponíveis (preenchido automaticamente a partir de availabilitySlots quando fornecido)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  availableDays?: string[];

  @ApiPropertyOptional({
    description:
      'Disponibilidade por dia com horários (substitui availableDays quando fornecido)',
    type: [AvailabilitySlotDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  availabilitySlots?: AvailabilitySlotDto[];

  @ApiPropertyOptional({
    example: 60,
    description:
      'Duração estimada do atendimento em minutos. Usada (com a pausa) para gerar os horários disponíveis. Default 60.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional({
    example: 0,
    description:
      'Pausa entre atendimentos em minutos (deslocamento/preparo/descanso). Default 0.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  breakBetweenAppointmentsMinutes?: number;

  @ApiPropertyOptional({
    description:
      'UUID do condomínio (preenchido automaticamente pelo backend se omitido)',
  })
  @IsOptional()
  @IsString()
  condominiumId?: string;
}
