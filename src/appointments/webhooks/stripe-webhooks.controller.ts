import { Controller, HttpCode, Post, Res, Req, Logger } from '@nestjs/common';
import type { Response, Request } from 'express';
import Stripe from 'stripe';
import { AppointmentsService } from '../appointments.service';
import { StripeConnectService } from '../../stripe-connect/stripe-connect.service';
import { ConfigService } from '@nestjs/config';

@Controller('stripe')
export class StripeWebhooksController {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeWebhooksController.name);

  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly stripeConnectService: StripeConnectService,
    private readonly configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }

    this.stripe = new Stripe(secretKey);
  }

  @Post('webhook')
  @HttpCode(200)
  async handleStripeWebhook(@Req() req: Request, @Res() res: Response) {
    const sig = req.headers['stripe-signature'];
    const platformSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    // Connect events são assinados com uma chave diferente quando usados via
    // `stripe listen --forward-connect-to` em dev. Em produção, dependendo da
    // config do dashboard, pode ser a mesma chave.
    const connectSecret = this.configService.get<string>(
      'STRIPE_CONNECT_WEBHOOK_SECRET',
    );

    if (!platformSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET não configurado');
      return res.status(500).send('Webhook secret não configurado');
    }

    if (!sig || typeof sig !== 'string') {
      this.logger.warn('Stripe signature ausente');
      return res.status(400).send('Missing stripe-signature');
    }

    // Tenta verificar com a chave da plataforma; se falhar, tenta com a do Connect.
    const candidateSecrets = [platformSecret, connectSecret].filter(
      (s): s is string => typeof s === 'string' && s.length > 0,
    );

    let event: Stripe.Event | null = null;
    let lastError: Error | null = null;

    for (const secret of candidateSecrets) {
      try {
        event = this.stripe.webhooks.constructEvent(req.body, sig, secret);
        break;
      } catch (err) {
        lastError = err as Error;
      }
    }

    if (!event) {
      this.logger.warn(
        `Webhook signature inválida (tentadas ${candidateSecrets.length} chave(s)): ${lastError?.message}`,
      );
      return res.status(400).send(`Webhook Error: ${lastError?.message}`);
    }

    this.logger.log(`Stripe webhook recebido: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        await this.appointmentsService.handleStripePaymentSucceeded(
          paymentIntent.id,
        );
        break;
      }
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        await this.appointmentsService.handleStripePaymentFailed(
          paymentIntent.id,
        );
        break;
      }
      case 'checkout.session.completed': {
        const session = event.data.object;
        const appointmentId = session.metadata?.appointmentId;
        const sessionId = session.id;

        if (session.payment_status === 'paid' && appointmentId) {
          await this.appointmentsService.handleStripeCheckoutSessionCompleted({
            appointmentId,
            sessionId,
          });
        }

        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object;
        const appointmentId = session.metadata?.appointmentId;

        if (appointmentId) {
          await this.appointmentsService.handleStripeCheckoutSessionExpired({
            appointmentId,
            sessionId: session.id,
          });
        }

        break;
      }
      // ── Stripe Connect: status da conta do prestador ──────────────────────
      case 'account.updated': {
        const account = event.data.object;
        await this.stripeConnectService.handleAccountUpdated(account.id);
        break;
      }
      default:
        this.logger.log(`Evento Stripe ignorado: ${event.type}`);
    }

    return res.json({ received: true });
  }
}
