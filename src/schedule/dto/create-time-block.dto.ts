import { IsNotEmpty, IsString, IsOptional, IsDateString, Matches } from 'class-validator';

export class CreateTimeBlockDto {
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'startTime deve estar no formato HH:mm' })
  startTime: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'endTime deve estar no formato HH:mm' })
  endTime: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
