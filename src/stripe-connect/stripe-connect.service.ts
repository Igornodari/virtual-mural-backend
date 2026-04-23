import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { User } from '../users/entities/user.entity';

export interface StripeConnectStatusResponse {
  accountId: string | null;
  status: 'pending' | 'active' | 'restricted' | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

export interface StripeConnectAccountResponse {
  accountId: string;
  onboardingUrl: string;
}

@Injectable()
export class StripeConnectService {
  private readonly logger = new Logger(StripeConnectService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }
    this.stripe = new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });
  }

  private getReturnUrl(path: string): string {
    const base =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:4200';
    return `${base}${path}`;
  }

  async getStatus(user: User): Promise<StripeConnectStatusResponse> {
    if (!user.stripeConnectAccountId) {
      return { accountId: null, status: null, chargesEnabled: false, payoutsEnabled: false };
    }

    try {
      const account = await this.stripe.accounts.retrieve(
        user.stripeConnectAccountId,
      );

      let status: 'pending' | 'active' | 'restricted';
      if (account.charges_enabled && account.payouts_enabled) {
        status = 'active';
      } else if (account.requirements?.disabled_reason) {
        status = 'restricted';
      } else {
        status = 'pending';
      }

      return {
        accountId: account.id,
        status,
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
      };
    } catch (err) {
      this.logger.error(`Erro ao buscar conta Stripe Connect: ${(err as Error).message}`);
      return { accountId: user.stripeConnectAccountId, status: null, chargesEnabled: false, payoutsEnabled: false };
    }
  }

  async createOrGetAccount(user: User): Promise<StripeConnectAccountResponse> {
    if (user.roleInCondominium !== 'provider') {
      throw new ForbiddenException('Apenas prestadores podem conectar conta Stripe.');
    }

    let accountId = user.stripeConnectAccountId;

    if (!accountId) {
      const account = await this.stripe.accounts.create({
        type: 'express',
        email: user.email,
        metadata: { userId: user.id },
      });
      accountId = account.id;

      await this.usersRepo.update(user.id, { stripeConnectAccountId: accountId });
      this.logger.log(`Conta Stripe Express criada: ${accountId} para user ${user.id}`);
    }

    const accountLink = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: this.getReturnUrl('/mural/provider?stripe_connect=refresh'),
      return_url: this.getReturnUrl('/mural/provider?stripe_connect=success'),
      type: 'account_onboarding',
    });

    return { accountId, onboardingUrl: accountLink.url };
  }

  async createOnboardingLink(user: User): Promise<{ onboardingUrl: string }> {
    if (!user.stripeConnectAccountId) {
      throw new BadRequestException('Nenhuma conta Stripe Connect encontrada. Use /account primeiro.');
    }

    const accountLink = await this.stripe.accountLinks.create({
      account: user.stripeConnectAccountId,
      refresh_url: this.getReturnUrl('/mural/provider?stripe_connect=refresh'),
      return_url: this.getReturnUrl('/mural/provider?stripe_connect=success'),
      type: 'account_onboarding',
    });

    return { onboardingUrl: accountLink.url };
  }

  async createDashboardLink(user: User): Promise<{ url: string }> {
    if (!user.stripeConnectAccountId) {
      throw new NotFoundException('Nenhuma conta Stripe Connect encontrada.');
    }

    const loginLink = await this.stripe.accounts.createLoginLink(
      user.stripeConnectAccountId,
    );

    return { url: loginLink.url };
  }
}
