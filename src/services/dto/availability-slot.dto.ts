import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches } from 'class-validator';
import { WEEKDAYS } from '../constants/weekdays.constant';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class AvailabilitySlotDto {
  @ApiProperty({ example: 'Segunda-feira', description: 'Dia da semana' })
  @IsString()
  @IsIn(WEEKDAYS)
  day: string;

  @ApiProperty({ example: '09:00', description: 'Horário de início (HH:mm)' })
  @IsString()
  @Matches(TIME_REGEX, { message: 'startTime deve estar no formato HH:mm' })
  startTime: string;

  @ApiProperty({ example: '18:00', description: 'Horário de término (HH:mm)' })
  @IsString()
  @Matches(TIME_REGEX, { message: 'endTime deve estar no formato HH:mm' })
  endTime: string;
}
