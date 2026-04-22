import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import type { UserRole } from '../entities/user.entity';

export class UpdateOnboardingDto {
  @ApiPropertyOptional({
    description: 'UUID do condomínio ao qual o usuário pertence',
  })
  @IsOptional()
  @IsUUID()
  condominiumId?: string;

  @ApiPropertyOptional({
    enum: ['provider', 'customer'],
    description: 'Perfil do usuário no condomínio',
  })
  @IsOptional()
  @IsEnum(['provider', 'customer'])
  roleInCondominium?: UserRole;
}
