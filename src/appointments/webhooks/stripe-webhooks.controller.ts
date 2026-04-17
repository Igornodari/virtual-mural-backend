import { Controller, HttpCode, Post, Res, Req, Logger } from '@nestjs/common';
import type { Response, Request } from 'express';
import Stripe from 'stripe';
import { AppointmentsService } from '../appointments.service';
import { ConfigService } from '@nestjs/config';

@Controller('api/stripe')
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

  @Post('webhook')
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
      default:
        this.logger.log(`Evento Stripe ignorado: ${event.type}`);
    }

    return res.json({ received: true });
  }
}
