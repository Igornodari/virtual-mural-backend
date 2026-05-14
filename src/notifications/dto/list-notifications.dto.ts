import { IsBooleanString, IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query params para `GET /notifications`.
 *
 * - `unread=true` filtra apenas não lidas (útil para badge counter)
 * - `limit`/`offset` paginação simples (default 20)
 */
export class ListNotificationsDto {
  @IsOptional()
  @IsBooleanString()
  unread?: 'true' | 'false';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
