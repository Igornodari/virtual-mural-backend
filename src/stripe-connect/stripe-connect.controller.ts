import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StripeConnectService } from './stripe-connect.service';
import { User } from '../users/entities/user.entity';

@ApiTags('stripe-connect')
@ApiBearerAuth('cognito-jwt')
@UseGuards(JwtAuthGuard)
@Controller('stripe/connect')
export class StripeConnectController {
  constructor(private readonly stripeConnectService: StripeConnectService) {}

  @Get('status')
  @ApiOperation({ summary: 'Retorna o status da conta Stripe Connect do prestador' })
  getStatus(@CurrentUser() user: User) {
    return this.stripeConnectService.getStatus(user);
  }

  @Post('account')
  @ApiOperation({ summary: 'Cria ou recupera conta Stripe Connect e retorna URL de onboarding' })
  createOrGetAccount(@CurrentUser() user: User) {
    return this.stripeConnectService.createOrGetAccount(user);
  }

  @Post('onboarding-link')
  @ApiOperation({ summary: 'Gera novo link de onboarding (caso o anterior tenha expirado)' })
  createOnboardingLink(@CurrentUser() user: User) {
    return this.stripeConnectService.createOnboardingLink(user);
  }

  @Post('dashboard-link')
  @ApiOperation({ summary: 'Gera link de acesso ao dashboard Stripe Express' })
  createDashboardLink(@CurrentUser() user: User) {
    return this.stripeConnectService.createDashboardLink(user);
  }
}
