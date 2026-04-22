import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateCondominiumDto {
  @ApiProperty({ example: 'Residencial Parque das Flores' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: '01310100' })
  @IsString()
  @Matches(/^\d{8}$/, {
    message: 'CEP deve conter exatamente 8 dígitos numéricos.',
  })
  addressZipCode: string;

  @ApiProperty({ example: 'Avenida Paulista' })
  @IsString()
  @IsNotEmpty()
  addressStreet: string;

  @ApiProperty({ example: '1000' })
  @IsString()
  @IsNotEmpty()
  addressNumber: string;

  @ApiPropertyOptional({ example: 'Bloco A' })
  @IsOptional()
  @IsString()
  addressComplement?: string;

  @ApiProperty({ example: 'Bela Vista' })
  @IsString()
  @IsNotEmpty()
  addressNeighborhood: string;

  @ApiProperty({ example: 'São Paulo' })
  @IsString()
  @IsNotEmpty()
  addressCity: string;

  @ApiProperty({ example: 'SP' })
  @IsString()
  @Length(2, 2)
  addressState: string;
}
