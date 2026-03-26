import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { IPaymentGateway } from './payment-gateway.interface';
import { Appointment } from '../entities/appointment.entity';
import { AppointmentPaymentResult } from '../dto/create-appointment-payment.dto';

@Injectable()
export class StripePaymentGatewayService implements IPaymentGateway {
    private readonly logger = new Logger(StripePaymentGatewayService.name);
    private readonly stripe: Stripe;

    constructor(private readonly config: ConfigService) {
        const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
        if (!secretKey) {
            throw new Error('STRIPE_SECRET_KEY is required for Stripe integration');
        }

        this.stripe = new Stripe(secretKey, {
            apiVersion: '2026-02-25.clover',
            // optional: set timeout, maxNetworkRetries etc.
            // timeout: 10000,
        });
    }

    async createPayment(
        appointment: Appointment,
        method: 'pix' | 'credit_card',
    ): Promise<AppointmentPaymentResult> {
        const amount = this.calculateAmount(appointment); // BRL cents
        const currency = 'brl';

        const successUrl =
            this.config.get<string>('STRIPE_SUCCESS_URL') ||
            'http://localhost:4200/payment-success?session_id={CHECKOUT_SESSION_ID}';
        const cancelUrl =
            this.config.get<string>('STRIPE_CANCEL_URL') ||
            'http://localhost:4200/payment-cancel';

        try {
            if (method === 'pix') {
                const paymentIntent = await this.stripe.paymentIntents.create({
                    amount,
                    currency,
                    payment_method_types: ['pix'],
                    metadata: {
                        appointmentId: appointment.id,
                        serviceId: appointment.serviceId,
                    },
                });

                this.logger.log(
                    `Criado PaymentIntent PIX ${paymentIntent.id} para appointment ${appointment.id}`,
                );

                return {
                    paymentId: paymentIntent.id,
                    paymentStatus: 'pending',
                    qrCode: paymentIntent.next_action?.pix_display_qr_code?.data || '',
                    qrCodeText:
                        paymentIntent.next_action?.pix_display_qr_code?.data || '',
                };
            }

            const session = await this.stripe.checkout.sessions.create({
                ui_mode: 'hosted',
                payment_method_types: ['card'],
                mode: 'payment',
                line_items: [
                    {
                        price_data: {
                            currency,
                            product_data: {
                                name: appointment.service?.name || 'Serviço Virtual Mural',
                                description:
                                    appointment.service?.description || 'Pagamento de serviço',
                            },
                            unit_amount: amount,
                        },
                        quantity: 1,
                    },
                ],
                success_url: successUrl,
                cancel_url: cancelUrl,
                metadata: {
                    appointmentId: appointment.id,
                    serviceId: appointment.serviceId,
                },
            });


            const paymentId =
                typeof session.payment_intent === 'string'
                    ? session.payment_intent
                    : session.payment_intent?.id || session.id;

            this.logger.log(
                `Criada Checkout Session ${session.id} para appointment ${appointment.id}, payment_intent=${paymentId}`,
            );

            const checkoutUrl = session.url || '';
            if (!checkoutUrl) {
                this.logger.error('Stripe checkout session sem URL retornada');
                throw new Error('Stripe Checkout session sem URL retornada');
            }

            // Verificar se a URL retornada está no formato esperado de Checkout Session
            if (!checkoutUrl.includes('/pay/cs_')) {
                this.logger.warn(
                    `URL de checkout inesperada: ${checkoutUrl} (esperado /pay/cs_)`,
                );
            }

            return {
                paymentId,
                paymentStatus: 'processing',
                checkoutUrl,
                checkoutSessionId: session.id,
            };
        } catch (error) {
            this.logger.error(
                `Erro ao criar pagamento Stripe: ${(error as Error).message}`,
                (error as Error).stack,
            );
            throw error;
        }
    }

    private calculateAmount(appointment: Appointment): number {
        if (!appointment.service || !appointment.service.price) {
            throw new Error('Serviço inválido no agendamento para cálculo de valor');
        }

        const priceStr = appointment.service.price;
        const numericPrice = parseFloat(
            priceStr.replace(/[^\d.,]/g, '').replace(',', '.'),
        );

        if (Number.isNaN(numericPrice)) {
            throw new Error(`Preço do serviço inválido: ${priceStr}`);
        }

        return Math.round(numericPrice * 100); // Convert to cents
    }
}
