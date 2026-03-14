import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

/**
 * StripeService encapsula toda a integração com o Stripe Connect.
 *
 * Modelo de split:
 *  - 95% do valor vai para a conta Connect do prestador
 *  - 5% fica na conta da plataforma (application_fee_amount)
 *
 * O dinheiro fica retido (capture_method: manual) até o morador confirmar
 * a conclusão do serviço, momento em que o capture é feito e o repasse ocorre.
 */
@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  /** Taxa da plataforma em percentual (0.05 = 5%) */
  private readonly PLATFORM_FEE_PERCENT = 0.05;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2026-02-25.clover',
    });
  }

  // ── Stripe Connect: onboarding do prestador ─────────────────────────────────

  /**
   * Cria uma conta Stripe Connect Express para o prestador.
   * Retorna o accountId para salvar no banco.
   */
  async createConnectAccount(email: string): Promise<string> {
    const account = await this.stripe.accounts.create({
      type: 'express',
      country: 'BR',
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'individual',
    });
    return account.id;
  }

  /**
   * Gera o link de onboarding do Stripe para o prestador completar
   * o cadastro de dados bancários e documentos.
   */
  async createOnboardingLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<string> {
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    return link.url;
  }

  /**
   * Verifica se o prestador completou o onboarding e está habilitado
   * a receber pagamentos.
   */
  async getAccountStatus(accountId: string): Promise<{
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
  }> {
    const account = await this.stripe.accounts.retrieve(accountId);
    return {
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    };
  }

  /**
   * Gera o link do dashboard Stripe Express para o prestador
   * visualizar seus repasses e saldo.
   */
  async createDashboardLink(accountId: string): Promise<string> {
    const link = await this.stripe.accounts.createLoginLink(accountId);
    return link.url;
  }

  // ── PaymentIntent com split automático ──────────────────────────────────────

  /**
   * Cria um PaymentIntent com:
   * - capture_method: manual (dinheiro retido até confirmação)
   * - application_fee_amount: 5% para a plataforma
   * - transfer_data.destination: conta Connect do prestador
   *
   * Retorna o clientSecret para o frontend confirmar o pagamento.
   */
  async createPaymentIntent(params: {
    amountInCents: number;
    providerStripeAccountId: string;
    appointmentId: string;
    serviceId: string;
    customerId: string;
  }): Promise<{ paymentIntentId: string; clientSecret: string }> {
    const feeAmount = Math.round(params.amountInCents * this.PLATFORM_FEE_PERCENT);

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: params.amountInCents,
      currency: 'brl',
      capture_method: 'manual',
      application_fee_amount: feeAmount,
      transfer_data: {
        destination: params.providerStripeAccountId,
      },
      metadata: {
        appointmentId: params.appointmentId,
        serviceId: params.serviceId,
        customerId: params.customerId,
      },
      automatic_payment_methods: { enabled: true },
    });

    return {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret!,
    };
  }

  /**
   * Captura o PaymentIntent (libera o dinheiro ao prestador).
   * Chamado quando o morador confirma a conclusão do serviço.
   */
  async capturePayment(paymentIntentId: string): Promise<void> {
    await this.stripe.paymentIntents.capture(paymentIntentId);
    this.logger.log(`PaymentIntent ${paymentIntentId} capturado com sucesso.`);
  }

  /**
   * Cancela o PaymentIntent e emite reembolso total.
   * Chamado quando o morador cancela antes da conclusão.
   */
  async refundPayment(paymentIntentId: string): Promise<string> {
    // Cancela o PaymentIntent (que ainda não foi capturado)
    try {
      await this.stripe.paymentIntents.cancel(paymentIntentId);
      this.logger.log(`PaymentIntent ${paymentIntentId} cancelado (reembolso automático).`);
      return 'cancelled';
    } catch {
      // Se já foi capturado, emite um refund explícito
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        reason: 'requested_by_customer',
      });
      this.logger.log(`Reembolso ${refund.id} criado para PaymentIntent ${paymentIntentId}.`);
      return refund.id;
    }
  }

  /**
   * Valida e processa um webhook do Stripe.
   */
  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET ?? '',
    );
  }
}
