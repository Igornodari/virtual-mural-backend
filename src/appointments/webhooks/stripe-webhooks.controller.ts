import { Controller, HttpCode, Post, Res, Req } from '@nestjs/common';
import type { Response, Request } from 'express';
import Stripe from 'stripe';
import { AppointmentsService } from '../appointments.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

@Controller('webhooks')
export class StripeWebhooksController {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeWebhooksController.name);

  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }

    this.stripe = new Stripe(secretKey);
  }

  @Post('stripe')
  @HttpCode(200)
  async handleStripeWebhook(@Req() req: Request, @Res() res: Response) {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    if (!webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET não configurado');
      return res.status(500).send('Webhook secret não configurado');
    }

    if (!sig || typeof sig !== 'string') {
      this.logger.warn('Stripe signature ausente');
      return res.status(400).send('Missing stripe-signature');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      this.logger.warn(`Webhook signature inválida: ${(err as Error).message}`);
      return res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    }

    this.logger.log(`Stripe webhook recebido: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await this.appointmentsService.handleStripePaymentSucceeded(
          paymentIntent.id,
        );
        break;
      }
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await this.appointmentsService.handleStripePaymentFailed(
          paymentIntent.id,
        );
        break;
      }
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id;

        if (paymentIntentId) {
          await this.appointmentsService.handleStripePaymentSucceeded(
            paymentIntentId,
          );
        }

        break;
      }
      default:
        this.logger.log(`Evento Stripe ignorado: ${event.type}`);
    }

    return res.json({ received: true });
  }
}
