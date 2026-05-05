import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { User } from '../users/entities/user.entity';

@Injectable()
export class StripeConnectService {
  private readonly logger = new Logger(StripeConnectService.name);
  private readonly stripe: Stripe;

  /** Taxa da plataforma em decimais (0.05 = 5%) */
  private readonly platformFeeRate: number;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) throw new Error('STRIPE_SECRET_KEY is required');

    this.stripe = new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });
    this.platformFeeRate =
      parseFloat(this.config.get<string>('PLATFORM_FEE_PERCENT', '5')) / 100;
  }

  /**
   * Cria (ou retorna existente) uma conta Stripe Express para o prestador.
   * Retorna o ID da conta e a URL de onboarding.
   */
  async createOrGetAccount(providerId: string): Promise<{
    accountId: string;
    onboardingUrl: string;
  }> {
    const provider = await this.findProvider(providerId);

    let accountId = provider.stripeAccountId;

    // Cria nova conta se ainda não existe
    if (!accountId) {
      const account = await this.stripe.accounts.create({
        type: 'express',
        country: 'BR',
        email: provider.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: { userId: providerId },
      });

      accountId = account.id;
      provider.stripeAccountId = accountId;
      provider.stripeAccountStatus = 'pending';
      await this.usersRepo.save(provider);

      this.logger.log(
        `Conta Stripe Express criada: ${accountId} para userId ${providerId}`,
      );
    }

    const onboardingUrl = await this.createAccountLink(accountId);
    return { accountId, onboardingUrl };
  }

  /**
   * Gera um link de onboarding (account link) para o prestador completar o cadastro no Stripe.
   */
  async createOnboardingLink(
    providerId: string,
  ): Promise<{ onboardingUrl: string }> {
    const provider = await this.findProvider(providerId);

    if (!provider.stripeAccountId) {
      throw new BadRequestException(
        'Conta Stripe ainda não criada. Chame /connect/account primeiro.',
      );
    }

    const url = await this.createAccountLink(provider.stripeAccountId);
    return { onboardingUrl: url };
  }

  /**
   * Retorna o status atual da conta Stripe Connect do prestador.
   *
   * Deriva o status a partir do dado ao vivo da Stripe (charges_enabled / payouts_enabled /
   * requirements.disabled_reason) e sincroniza o banco se houver divergência.
   * Isso garante que o frontend recebe o estado correto mesmo se o webhook
   * `account.updated` ainda não tiver sido processado.
   */
  async getStatus(providerId: string): Promise<{
    accountId: string | null;
    status: 'pending' | 'active' | 'restricted' | null;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  }> {
    const provider = await this.findProvider(providerId);

    if (!provider.stripeAccountId) {
      return {
        accountId: null,
        status: null,
        chargesEnabled: false,
        payoutsEnabled: false,
      };
    }

    const account = await this.stripe.accounts.retrieve(
      provider.stripeAccountId,
    );

    const liveStatus = this.deriveStatus(account);

    // Sincroniza DB se o status mudou (caminho safety-net caso webhook atrase)
    if (provider.stripeAccountStatus !== liveStatus) {
      provider.stripeAccountStatus = liveStatus;
      await this.usersRepo.save(provider);
      this.logger.log(
        `Status sincronizado via getStatus: ${provider.stripeAccountId} → ${liveStatus}`,
      );
    }

    return {
      accountId: provider.stripeAccountId,
      status: liveStatus,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    };
  }

  /**
   * Deriva o status (`pending`/`active`/`restricted`) a partir da resposta da Stripe.
   * Centraliza a lógica pra ser usada tanto no `getStatus` quanto no webhook `account.updated`.
   */
  private deriveStatus(
    account: Stripe.Account,
  ): 'pending' | 'active' | 'restricted' {
    const isActive = account.charges_enabled && account.payouts_enabled;
    const isRestricted = !isActive && !!account.requirements?.disabled_reason;

    if (isActive) return 'active';
    if (isRestricted) return 'restricted';
    return 'pending';
  }

  /**
   * Gera um link para o dashboard Stripe Express do prestador (onde ele vê seus pagamentos).
   */
  async createDashboardLink(providerId: string): Promise<{ url: string }> {
    const provider = await this.findProvider(providerId);

    if (!provider.stripeAccountId) {
      throw new BadRequestException(
        'Conta Stripe não encontrada para este prestador.',
      );
    }

    const loginLink = await this.stripe.accounts.createLoginLink(
      provider.stripeAccountId,
    );

    return { url: loginLink.url };
  }

  /**
   * Chamado pelo webhook `account.updated` para atualizar status no banco.
   */
  async handleAccountUpdated(stripeAccountId: string): Promise<void> {
    const account = await this.stripe.accounts.retrieve(stripeAccountId);
    const provider = await this.usersRepo.findOne({
      where: { stripeAccountId },
    });

    if (!provider) {
      this.logger.warn(
        `Nenhum provider encontrado para conta Stripe ${stripeAccountId}`,
      );
      return;
    }

    const newStatus = this.deriveStatus(account);

    if (provider.stripeAccountStatus === newStatus) {
      // Sem mudança — evita save desnecessário (account.updated dispara muitas vezes)
      return;
    }

    provider.stripeAccountStatus = newStatus;
    await this.usersRepo.save(provider);

    this.logger.log(
      `Conta Stripe ${stripeAccountId} → status: ${newStatus} (via webhook)`,
    );
  }

  /**
   * Calcula a taxa da plataforma em centavos (5% por padrão).
   */
  calculatePlatformFee(amountCents: number): number {
    return Math.round(amountCents * this.platformFeeRate);
  }

  private async findProvider(userId: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`Usuário ${userId} não encontrado.`);
    return user;
  }

  private async createAccountLink(accountId: string): Promise<string> {
    const returnUrl =
      this.config.get<string>('STRIPE_CONNECT_RETURN_URL') ||
      'http://localhost:4200/mural/provider?stripe_connect=success';

    const refreshUrl =
      this.config.get<string>('STRIPE_CONNECT_REFRESH_URL') ||
      'http://localhost:4200/mural/provider?stripe_connect=refresh';

    const accountLink = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    return accountLink.url;
  }
}
