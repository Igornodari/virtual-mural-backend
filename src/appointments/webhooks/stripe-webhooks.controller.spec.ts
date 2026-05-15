// Stripe é instanciado no construtor — mockamos antes de qualquer import
jest.mock('stripe', () => {
  const mockWebhooks = {
    constructEvent: jest.fn(),
  };

  const MockStripe = jest.fn().mockImplementation(() => ({
    webhooks: mockWebhooks,
  }));

  // Expõe o mock de webhooks para ser acessado nos testes
  (MockStripe as unknown as Record<string, unknown>).__mockWebhooks =
    mockWebhooks;

  return MockStripe;
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import { StripeWebhooksController } from './stripe-webhooks.controller';
import { AppointmentsService } from '../services/appointments.service';
import { StripeConnectService } from '../../stripe-connect/stripe-connect.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(
  overrides: Partial<{
    headers: Record<string, string>;
    body: Buffer;
  }> = {},
) {
  return {
    headers: { 'stripe-signature': 'whsig_test', ...overrides.headers },
    body: overrides.body ?? Buffer.from('{}'),
  };
}

function makeRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

function makeEvent(type: string, data: Record<string, unknown> = {}): Stripe.Event {
  return {
    id: 'evt_test',
    type,
    data: { object: data },
    object: 'event',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
  } as unknown as Stripe.Event;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('StripeWebhooksController', () => {
  let controller: StripeWebhooksController;
  let appointmentsService: {
    handleStripePaymentSucceeded: jest.Mock;
    handleStripePaymentFailed: jest.Mock;
    handleStripeCheckoutSessionCompleted: jest.Mock;
    handleStripeCheckoutSessionExpired: jest.Mock;
  };
  let stripeConnectService: { handleAccountUpdated: jest.Mock };
  let constructEventMock: jest.Mock;

  beforeEach(async () => {
    appointmentsService = {
      handleStripePaymentSucceeded: jest.fn().mockResolvedValue(undefined),
      handleStripePaymentFailed: jest.fn().mockResolvedValue(undefined),
      handleStripeCheckoutSessionCompleted: jest.fn().mockResolvedValue(undefined),
      handleStripeCheckoutSessionExpired: jest.fn().mockResolvedValue(undefined),
    };
    stripeConnectService = {
      handleAccountUpdated: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhooksController],
      providers: [
        {
          provide: AppointmentsService,
          useValue: appointmentsService,
        },
        {
          provide: StripeConnectService,
          useValue: stripeConnectService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              const map: Record<string, string> = {
                STRIPE_SECRET_KEY: 'sk_test_abc',
                STRIPE_WEBHOOK_SECRET: 'whsec_platform',
                STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect',
              };
              return map[key];
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<StripeWebhooksController>(StripeWebhooksController);

    // Acessa o mock de webhooks.constructEvent registrado no jest.mock acima
    const StripeMock = Stripe as unknown as Record<string, unknown>;
    constructEventMock = (
      StripeMock.__mockWebhooks as Record<string, jest.Mock>
    ).constructEvent;
    constructEventMock.mockReset();
  });

  afterEach(() => jest.clearAllMocks());

  // ── Signature validation ────────────────────────────────────────────────────

  it('deve retornar 400 se a stripe-signature estiver ausente', async () => {
    // Constrói o req diretamente sem o header — makeReq() sempre inclui stripe-signature por padrão
    const req = { headers: {}, body: Buffer.from('{}') };
    const res = makeRes();

    await controller.handleStripeWebhook(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Missing stripe-signature');
  });

  it('deve retornar 400 se a assinatura for inválida', async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error('Signature verification failed');
    });

    const req = makeReq();
    const res = makeRes();

    await controller.handleStripeWebhook(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  // ── payment_intent.succeeded ────────────────────────────────────────────────

  it('deve chamar handleStripePaymentSucceeded no payment_intent.succeeded', async () => {
    const event = makeEvent('payment_intent.succeeded', { id: 'pi_test_123' });
    constructEventMock.mockReturnValue(event);

    const req = makeReq();
    const res = makeRes();

    await controller.handleStripeWebhook(req as never, res as never);

    expect(appointmentsService.handleStripePaymentSucceeded).toHaveBeenCalledWith(
      'pi_test_123',
    );
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  // ── payment_intent.payment_failed ──────────────────────────────────────────

  it('deve chamar handleStripePaymentFailed no payment_intent.payment_failed', async () => {
    const event = makeEvent('payment_intent.payment_failed', {
      id: 'pi_failed_123',
    });
    constructEventMock.mockReturnValue(event);

    const req = makeReq();
    const res = makeRes();

    await controller.handleStripeWebhook(req as never, res as never);

    expect(appointmentsService.handleStripePaymentFailed).toHaveBeenCalledWith(
      'pi_failed_123',
    );
  });

  // ── checkout.session.completed ─────────────────────────────────────────────

  it('deve chamar handleStripeCheckoutSessionCompleted quando payment_status=paid', async () => {
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_test_completed',
      payment_status: 'paid',
      metadata: { appointmentId: 'appt-uuid-1' },
    });
    constructEventMock.mockReturnValue(event);

    const req = makeReq();
    const res = makeRes();

    await controller.handleStripeWebhook(req as never, res as never);

    expect(
      appointmentsService.handleStripeCheckoutSessionCompleted,
    ).toHaveBeenCalledWith({
      appointmentId: 'appt-uuid-1',
      sessionId: 'cs_test_completed',
    });
  });

  it('não deve chamar handleStripeCheckoutSessionCompleted se payment_status não é paid', async () => {
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_test_unpaid',
      payment_status: 'unpaid',
      metadata: { appointmentId: 'appt-uuid-1' },
    });
    constructEventMock.mockReturnValue(event);

    const req = makeReq();
    const res = makeRes();

    await controller.handleStripeWebhook(req as never, res as never);

    expect(
      appointmentsService.handleStripeCheckoutSessionCompleted,
    ).not.toHaveBeenCalled();
  });

  it('não deve chamar handleStripeCheckoutSessionCompleted se não houver appointmentId no metadata', async () => {
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_test_noappt',
      payment_status: 'paid',
      metadata: {}, // sem appointmentId
    });
    constructEventMock.mockReturnValue(event);

    const req = makeReq();
    const res = makeRes();

    await controller.handleStripeWebhook(req as never, res as never);

    expect(
      appointmentsService.handleStripeCheckoutSessionCompleted,
    ).not.toHaveBeenCalled();
  });

  // ── checkout.session.expired ───────────────────────────────────────────────

  it('deve chamar handleStripeCheckoutSessionExpired no checkout.session.expired', async () => {
    const event = makeEvent('checkout.session.expired', {
      id: 'cs_expired',
      metadata: { appointmentId: 'appt-uuid-1' },
    });
    constructEventMock.mockReturnValue(event);

    const req = makeReq();
    const res = makeRes();

    await controller.handleStripeWebhook(req as never, res as never);

    expect(
      appointmentsService.handleStripeCheckoutSessionExpired,
    ).toHaveBeenCalledWith({
      appointmentId: 'appt-uuid-1',
      sessionId: 'cs_expired',
    });
  });

  // ── account.updated (Stripe Connect) ──────────────────────────────────────

  it('deve chamar handleAccountUpdated no account.updated', async () => {
    const event = makeEvent('account.updated', { id: 'acct_test_123' });
    constructEventMock.mockReturnValue(event);

    const req = makeReq();
    const res = makeRes();

    await controller.handleStripeWebhook(req as never, res as never);

    expect(stripeConnectService.handleAccountUpdated).toHaveBeenCalledWith(
      'acct_test_123',
    );
  });

  // ── Evento desconhecido ────────────────────────────────────────────────────

  it('deve ignorar eventos desconhecidos e retornar { received: true }', async () => {
    const event = makeEvent('customer.created', { id: 'cus_xyz' });
    constructEventMock.mockReturnValue(event);

    const req = makeReq();
    const res = makeRes();

    await controller.handleStripeWebhook(req as never, res as never);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    // Nenhum método de negócio deve ter sido chamado
    expect(appointmentsService.handleStripePaymentSucceeded).not.toHaveBeenCalled();
    expect(stripeConnectService.handleAccountUpdated).not.toHaveBeenCalled();
  });
});
