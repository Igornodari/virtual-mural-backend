import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMinSize,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AvailabilitySlotDto {
  @ApiProperty({ example: 'Segunda-feira' })
  @IsString()
  @IsNotEmpty()
  day!: string;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime deve estar no formato HH:mm',
  })
  startTime: string | undefined;

  @ApiProperty({ example: '18:00' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'endTime deve estar no formato HH:mm',
  })
  endTime!: string;
}

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

  @ApiProperty({
    example: [
      'Segunda-feira',
      'Terça-feira',
      'Quarta-feira',
      'Quinta-feira',
      'Sexta-feira',
      'Sábado',
      'Domingo',
    ],
    description: 'Dias da semana disponíveis para agendamento',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  availableDays: string[] | undefined;

  @ApiPropertyOptional({
    description: 'Horários disponíveis por dia',
    example: [
      {
        day: 'Segunda-feira',
        startTime: '09:00',
        endTime: '18:00',
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  availabilitySlots?: AvailabilitySlotDto[];

  @ApiPropertyOptional({
    description:
      'UUID do condomínio (preenchido automaticamente pelo backend se omitido)',
  })
  @IsOptional()
  @IsString()
  condominiumId?: string;
}
