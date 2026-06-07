// Stripe é instanciado no construtor — mockamos antes de qualquer import
jest.mock('stripe', () => {
  const mockPaymentIntents = { create: jest.fn() };
  const mockCheckoutSessions = { create: jest.fn() };

  const MockStripe = jest.fn().mockImplementation(() => ({
    paymentIntents: mockPaymentIntents,
    checkout: { sessions: mockCheckoutSessions },
  }));

  (MockStripe as unknown as Record<string, unknown>).__mockPaymentIntents =
    mockPaymentIntents;
  (MockStripe as unknown as Record<string, unknown>).__mockCheckoutSessions =
    mockCheckoutSessions;

  return MockStripe;
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import { StripePaymentGatewayService } from './stripe-payment-gateway.service';
import { Appointment } from '../entities/appointment.entity';

const makeAppointment = (price = '150,00'): Appointment =>
  ({
    id: 'appt-1',
    serviceId: 'svc-1',
    service: { id: 'svc-1', name: 'Limpeza', description: 'desc', price },
  }) as unknown as Appointment;

describe('StripePaymentGatewayService — split/transfer (M5)', () => {
  let service: StripePaymentGatewayService;
  let paymentIntents: Record<string, jest.Mock>;
  let checkoutSessions: Record<string, jest.Mock>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripePaymentGatewayService,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation((key: string) =>
                key === 'STRIPE_SECRET_KEY' ? 'sk_test_abc' : undefined,
              ),
          },
        },
      ],
    }).compile();

    service = module.get<StripePaymentGatewayService>(
      StripePaymentGatewayService,
    );

    const StripeMock = Stripe as unknown as Record<string, unknown>;
    paymentIntents = StripeMock.__mockPaymentIntents as Record<
      string,
      jest.Mock
    >;
    checkoutSessions = StripeMock.__mockCheckoutSessions as Record<
      string,
      jest.Mock
    >;

    paymentIntents.create.mockReset();
    checkoutSessions.create.mockReset();
  });

  afterEach(() => jest.clearAllMocks());

  describe('Pix', () => {
    beforeEach(() => {
      paymentIntents.create.mockResolvedValue({
        id: 'pi_pix_1',
        next_action: { pix_display_qr_code: { data: 'QR' } },
      });
    });

    it('aplica split (application_fee_amount + transfer_data) quando o prestador tem conta Connect', async () => {
      const result = await service.createPayment(
        makeAppointment('150,00'),
        'pix',
        'acct_prov_1',
      );

      expect(paymentIntents.create).toHaveBeenCalledTimes(1);
      const params = (
        paymentIntents.create.mock.calls as [Stripe.PaymentIntentCreateParams][]
      )[0][0];
      expect(params.application_fee_amount).toBe(750); // 5% de 15000
      expect(params.transfer_data).toEqual({ destination: 'acct_prov_1' });
      expect(result).toMatchObject({
        paymentId: 'pi_pix_1',
        paymentStatus: 'pending',
        qrCode: 'QR',
      });
    });

    it('NÃO aplica split quando o prestador não tem conta Connect (coleta para a plataforma)', async () => {
      await service.createPayment(makeAppointment('150,00'), 'pix', null);

      const params = (
        paymentIntents.create.mock.calls as [Stripe.PaymentIntentCreateParams][]
      )[0][0];
      expect(params.application_fee_amount).toBeUndefined();
      expect(params.transfer_data).toBeUndefined();
    });
  });

  describe('Cartão (Checkout Session)', () => {
    beforeEach(() => {
      checkoutSessions.create.mockResolvedValue({
        id: 'cs_1',
        url: 'https://checkout.stripe.com/c/pay/cs_test_1',
        payment_intent: 'pi_card_1',
      });
    });

    it('aplica split via payment_intent_data quando há conta Connect', async () => {
      const result = await service.createPayment(
        makeAppointment('150,00'),
        'credit_card',
        'acct_prov_1',
      );

      const params = (
        checkoutSessions.create.mock.calls as [
          Stripe.Checkout.SessionCreateParams,
        ][]
      )[0][0];
      expect(params.payment_intent_data?.application_fee_amount).toBe(750);
      expect(params.payment_intent_data?.transfer_data).toEqual({
        destination: 'acct_prov_1',
      });
      expect(result).toMatchObject({
        paymentId: 'pi_card_1',
        paymentStatus: 'processing',
        checkoutSessionId: 'cs_1',
      });
      expect(result.checkoutUrl).toContain('/pay/cs_');
    });

    it('NÃO aplica split quando não há conta Connect', async () => {
      await service.createPayment(
        makeAppointment('150,00'),
        'credit_card',
        undefined,
      );

      const params = (
        checkoutSessions.create.mock.calls as [
          Stripe.Checkout.SessionCreateParams,
        ][]
      )[0][0];
      expect(params.payment_intent_data).toBeUndefined();
    });
  });

  describe('cálculo de valor e taxa', () => {
    it('converte preço "150,00" para 15000 centavos e fee de 5% (750)', async () => {
      paymentIntents.create.mockResolvedValue({
        id: 'pi',
        next_action: { pix_display_qr_code: { data: '' } },
      });

      await service.createPayment(makeAppointment('150,00'), 'pix', 'acct_1');

      const params = (
        paymentIntents.create.mock.calls as [Stripe.PaymentIntentCreateParams][]
      )[0][0];
      expect(params.amount).toBe(15000);
      expect(params.application_fee_amount).toBe(750);
    });

    it('lança erro quando o preço do serviço é inválido', async () => {
      await expect(
        service.createPayment(makeAppointment('abc'), 'pix', 'acct_1'),
      ).rejects.toThrow();
    });
  });
});
