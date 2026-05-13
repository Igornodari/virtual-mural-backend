import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class UpdateOnboardingDto {
  @ApiPropertyOptional({
    description: 'UUID do condomínio ao qual o usuário pertence',
  })
  @IsOptional()
  @IsUUID()
  condominiumId?: string;

  @ApiPropertyOptional({
    description:
      'Ativa o modo prestador para o usuário. Quando true, libera acesso à ' +
      'área de publicação de serviços. Pode ser revertido para false desde ' +
      'que o usuário não tenha serviços ativos nem agendamentos pendentes.',
  })
  @IsOptional()
  @IsBoolean()
  isProvider?: boolean;
}
