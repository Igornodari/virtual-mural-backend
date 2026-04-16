import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';

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
  availableDays: string[];

  @ApiPropertyOptional({
    description:
      'UUID do condomínio (preenchido automaticamente pelo backend se omitido)',
  })
  @IsOptional()
  @IsString()
  condominiumId?: string;
}
