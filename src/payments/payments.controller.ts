import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Req,
  UseGuards,
  Logger,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  // ── Stripe Connect: onboarding do prestador ─────────────────────────────────

  @Post('connect/onboard')
  @ApiBearerAuth('cognito-jwt')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Inicia o onboarding Stripe Connect para o prestador',
    description:
      'Cria (ou recupera) a conta Stripe Express do prestador e retorna ' +
      'o link de onboarding para cadastro de dados bancários.',
  })
  async startOnboarding(
    @CurrentUser() user: User,
    @Body() body: { refreshUrl: string; returnUrl: string },
  ) {
    return this.paymentsService.startProviderOnboarding(
      user,
      body.refreshUrl,
      body.returnUrl,
    );
  }

  @Get('connect/status')
  @ApiBearerAuth('cognito-jwt')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Retorna o status da conta Stripe Connect do prestador' })
  async getConnectStatus(@CurrentUser() user: User) {
    return this.paymentsService.getProviderConnectStatus(user);
  }

  @Get('connect/dashboard')
  @ApiBearerAuth('cognito-jwt')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Gera link do dashboard Stripe Express do prestador' })
  async getDashboardLink(@CurrentUser() user: User) {
    return this.paymentsService.getProviderDashboardLink(user);
  }

  // ── Webhook Stripe ───────────────────────────────────────────────────────────

  @Post('webhook')
  @ApiOperation({
    summary: 'Webhook do Stripe (não requer autenticação JWT)',
    description: 'Recebe eventos do Stripe: payment_intent.succeeded, etc.',
  })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const payload = req.rawBody;
    if (!payload) {
      this.logger.warn('Webhook recebido sem rawBody.');
      return { received: false };
    }
    await this.paymentsService.handleWebhook(payload, signature);
    return { received: true };
  }
}
