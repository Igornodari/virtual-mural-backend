import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('users')
@ApiBearerAuth('cognito-jwt')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Retorna o perfil completo do usuário autenticado' })
  getMe(@CurrentUser() user: User) {
    return user;
  }

  @Patch('me/profile')
  @ApiOperation({ summary: 'Atualiza nome, telefone e avatar do usuário' })
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Patch('me/onboarding')
  @ApiOperation({
    summary: 'Salva o condomínio e/ou o opt-in de prestador',
    description:
      'Endpoint chamado pelo frontend para vincular o usuário a um ' +
      'condomínio durante o onboarding, ou para ativar/desativar o ' +
      'modo prestador a qualquer momento.',
  })
  updateOnboarding(
    @CurrentUser() user: User,
    @Body() dto: UpdateOnboardingDto,
  ) {
    return this.usersService.updateOnboarding(user.id, dto);
  }

  // ── LGPD — Direito de acesso (Art. 18, I) ───────────────────────────────
  @Get('me/export')
  @ApiOperation({
    summary: 'Exporta todos os dados pessoais do usuário (LGPD Art. 18, I)',
    description:
      'Retorna um JSON com todos os dados pessoais coletados pelo sistema, ' +
      'incluindo serviços publicados e histórico de agendamentos.',
  })
  @ApiResponse({ status: 200, description: 'Dados exportados com sucesso.' })
  @Throttle({ strict: { limit: 5, ttl: 3_600_000 } }) // max 5 exports por hora
  exportData(@CurrentUser() user: User) {
    return this.usersService.exportData(user.id);
  }

  // ── LGPD — Direito ao esquecimento (Art. 18, IV) ─────────────────────────
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a conta do usuário (LGPD Art. 18, IV — direito ao esquecimento)',
    description:
      'Anonimiza todos os dados pessoais do usuário. A operação é irreversível. ' +
      'Bloqueada se houver serviços ativos ou agendamentos em aberto.',
  })
  @ApiResponse({ status: 204, description: 'Conta removida com sucesso.' })
  @ApiResponse({
    status: 400,
    description: 'Há serviços ativos ou agendamentos em aberto.',
  })
  @Throttle({ strict: { limit: 3, ttl: 3_600_000 } }) // max 3 tentativas por hora
  async deleteAccount(@CurrentUser() user: User): Promise<void> {
    await this.usersService.deleteAccount(user.id);
  }
}
