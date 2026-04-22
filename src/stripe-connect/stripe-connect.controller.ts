import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StripeConnectService } from './stripe-connect.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('Stripe Connect')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stripe/connect')
export class StripeConnectController {
  constructor(private readonly connectService: StripeConnectService) {}

  /**
   * Cria (ou retorna) a conta Stripe Express do prestador logado
   * e retorna a URL de onboarding.
   */
  @Post('account')
  @ApiOperation({ summary: 'Criar ou obter conta Stripe Connect do prestador' })
  createOrGetAccount(@CurrentUser() user: User) {
    return this.connectService.createOrGetAccount(user.id);
  }

  /**
   * Gera um novo link de onboarding para o prestador completar/retomar o cadastro.
   */
  @Post('onboarding-link')
  @ApiOperation({ summary: 'Gerar link de onboarding Stripe' })
  createOnboardingLink(@CurrentUser() user: User) {
    return this.connectService.createOnboardingLink(user.id);
  }

  /**
   * Retorna o status atual da conta Stripe Connect.
   */
  @Get('status')
  @ApiOperation({ summary: 'Verificar status da conta Stripe Connect' })
  getStatus(@CurrentUser() user: User) {
    return this.connectService.getStatus(user.id);
  }

  /**
   * Gera link para o dashboard Stripe Express (onde o prestador vê seus recebíveis).
   */
  @Post('dashboard-link')
  @ApiOperation({ summary: 'Acessar painel de pagamentos Stripe' })
  createDashboardLink(@CurrentUser() user: User) {
    return this.connectService.createDashboardLink(user.id);
  }
}
