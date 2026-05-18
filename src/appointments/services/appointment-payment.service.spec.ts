// Stripe é instanciado no construtor — mockamos antes de qualquer import
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        retrieve: jest.fn(),
      },
    },
  }));
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppointmentPaymentService } from './appointment-payment.service';
import { AppointmentQueryService } from './appointment-query.service';
import { AppointmentNotificationService } from './appointment-notification.service';
import { Appointment } from '../entities/appointment.entity';
import { Payment } from '../entities/payment.entity';
import { Service } from '../../services/entities/service.entity';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeAppointment = (overrides: Partial<Appointment> = {}): Appointment =>
  ({
    id: 'appt-uuid-1',
    customerId: 'customer-uuid',
    serviceId: 'service-uuid',
    status: 'confirmed',
    scheduledDate: '2030-12-01',
    scheduledTime: '09:00',
    scheduledDay: 'monday',
    service: {
      id: 'service-uuid',
      name: 'Pintura',
      provider: {
        id: 'provider-uuid',
        email: 'provider@example.com',
        stripeAccountStatus: 'active',
        stripeAccountId: 'acct_test',
      },
    },
    customer: { id: 'customer-uuid', email: 'customer@example.com' },
    ...overrides,
  }) as unknown as Appointment;

const makePayment = (overrides: Partial<Payment> = {}): Payment =>
  ({
    id: 'payment-uuid',
    appointmentId: 'appt-uuid-1',
    method: 'credit_card',
    status: 'pending',
    externalPaymentId: 'pi_test_123',
    checkoutSessionId: 'cs_test_123',
    checkoutUrl: 'https://checkout.stripe.com/pay/cs_test_123',
    qrCode: null,
    qrCodeText: null,
    createdAt: new Date(),
    ...overrides,
  }) as unknown as Payment;

// ── Transaction mock factory ──────────────────────────────────────────────────
//
// O payAppointment usa manager.transaction(async (manager) => { ... }).
// Para testar os caminhos internos, fazemos o mock executar o callback
// imediatamente com um EntityManager falso que delega para repos separados.

function buildTransactionMock(
  apptManagerRepo: Record<string, jest.Mock>,
  paymentManagerRepo: Record<string, jest.Mock>,
  serviceManagerRepo: Record<string, jest.Mock>,
) {
  const mockEntityManager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Appointment) return apptManagerRepo;
      if (entity === Payment) return paymentManagerRepo;
      if (entity === Service) return serviceManagerRepo;
      return {};
    }),
  };

  return jest
    .fn()
    .mockImplementation((cb: (em: unknown) => Promise<unknown>) =>
      cb(mockEntityManager),
    );
}

describe('AppointmentPaymentService', () => {
  let service: AppointmentPaymentService;

  // Repos top-level (usados em métodos fora da transaction)
  let paymentsRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let appointmentsRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    manager: { transaction: jest.Mock };
  };

  // Repos dentro da transaction
  let apptManagerRepo: Record<string, jest.Mock>;
  let paymentManagerRepo: Record<string, jest.Mock>;
  let serviceManagerRepo: Record<string, jest.Mock>;

  let queryService: { findOne: jest.Mock };
  let notificationService: { publishAppointmentStatusChanged: jest.Mock };
  let paymentGateway: { createPayment: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    apptManagerRepo = { findOne: jest.fn(), save: jest.fn() };
    paymentManagerRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    serviceManagerRepo = { findOne: jest.fn() };

    const transactionMock = buildTransactionMock(
      apptManagerRepo,
      paymentManagerRepo,
      serviceManagerRepo,
    );

    appointmentsRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      manager: { transaction: transactionMock },
    };

    paymentsRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    queryService = { findOne: jest.fn() };
    notificationService = {
      publishAppointmentStatusChanged: jest.fn().mockResolvedValue(undefined),
    };
    paymentGateway = { createPayment: jest.fn() };
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        const map: Record<string, string> = {
          STRIPE_SECRET_KEY: 'sk_test_abc',
        };
        return map[key] ?? undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentPaymentService,
        {
          provide: getRepositoryToken(Appointment),
          useValue: appointmentsRepo,
        },
        { provide: getRepositoryToken(Payment), useValue: paymentsRepo },
        { provide: getRepositoryToken(Service), useValue: {} },
        { provide: ConfigService, useValue: configService },
        { provide: AppointmentQueryService, useValue: queryService },
        {
          provide: AppointmentNotificationService,
          useValue: notificationService,
        },
        { provide: 'PAYMENT_GATEWAY', useValue: paymentGateway },
      ],
    }).compile();

    service = module.get<AppointmentPaymentService>(AppointmentPaymentService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── payAppointment ──────────────────────────────────────────────────────────

  describe('payAppointment', () => {
    const customer = { id: 'customer-uuid', email: 'customer@example.com' };

    it('deve processar pagamento novo com credit_card e retornar checkoutUrl', async () => {
      const appointment = makeAppointment({ status: 'confirmed' });
      const savedAppointment = { ...appointment, status: 'awaiting_payment' };

      queryService.findOne.mockResolvedValue(appointment);
      apptManagerRepo.findOne.mockResolvedValue(appointment);
      serviceManagerRepo.findOne.mockResolvedValue(appointment.service);
      paymentManagerRepo.findOne.mockResolvedValue(null); // sem pagamento anterior
      paymentGateway.createPayment.mockResolvedValue({
        paymentId: 'cs_test_abc',
        paymentStatus: 'pending',
        checkoutUrl: 'https://checkout.stripe.com/pay/cs_test_abc',
        checkoutSessionId: 'cs_test_abc',
      });

      const newPayment = makePayment({
        externalPaymentId: 'cs_test_abc',
        checkoutSessionId: 'cs_test_abc',
        checkoutUrl: 'https://checkout.stripe.com/pay/cs_test_abc',
      });
      paymentManagerRepo.create.mockReturnValue(newPayment);
      paymentManagerRepo.save.mockResolvedValue(newPayment);
      apptManagerRepo.save.mockResolvedValue(savedAppointment);

      const result = await service.payAppointment(
        'appt-uuid-1',
        { method: 'credit_card' },
        customer as never,
      );

      expect(paymentGateway.createPayment).toHaveBeenCalled();
      expect(paymentManagerRepo.save).toHaveBeenCalled();
      expect(result.checkoutUrl).toBe(
        'https://checkout.stripe.com/pay/cs_test_abc',
      );
      expect(
        notificationService.publishAppointmentStatusChanged,
      ).toHaveBeenCalled();
    });

    it('deve reutilizar pagamento existente não-failed', async () => {
      const appointment = makeAppointment({ status: 'awaiting_payment' });
      const existingPayment = makePayment({
        status: 'pending',
        checkoutUrl: 'https://checkout.stripe.com/pay/cs_existing',
      });

      queryService.findOne.mockResolvedValue(appointment);
      apptManagerRepo.findOne.mockResolvedValue(appointment);
      serviceManagerRepo.findOne.mockResolvedValue(appointment.service);
      paymentManagerRepo.findOne.mockResolvedValue(existingPayment);

      const result = await service.payAppointment(
        'appt-uuid-1',
        { method: 'credit_card' },
        customer as never,
      );

      expect(paymentGateway.createPayment).not.toHaveBeenCalled();
      expect(result.checkoutUrl).toBe(
        'https://checkout.stripe.com/pay/cs_existing',
      );
    });

    it('deve lançar ForbiddenException se o cliente não é o dono do agendamento', async () => {
      const appointment = makeAppointment({ customerId: 'outro-uuid' });
      queryService.findOne.mockResolvedValue(appointment);

      await expect(
        service.payAppointment(
          'appt-uuid-1',
          { method: 'credit_card' },
          customer as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar BadRequestException se o agendamento não está em status pagável', async () => {
      const appointment = makeAppointment({ status: 'cancelled' });
      queryService.findOne.mockResolvedValue(appointment);

      await expect(
        service.payAppointment(
          'appt-uuid-1',
          { method: 'credit_card' },
          customer as never,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar NotFoundException se o agendamento não for encontrado na transaction', async () => {
      const appointment = makeAppointment({ status: 'confirmed' });
      queryService.findOne.mockResolvedValue(appointment);
      apptManagerRepo.findOne.mockResolvedValue(null); // não encontrado no lock

      await expect(
        service.payAppointment(
          'appt-uuid-1',
          { method: 'credit_card' },
          customer as never,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── handleStripeCheckoutSessionCompleted ────────────────────────────────────

  describe('handleStripeCheckoutSessionCompleted', () => {
    it('deve marcar appointment e payment como paid', async () => {
      const appointment = makeAppointment({ status: 'awaiting_payment' });
      const payment = makePayment({ status: 'pending' });

      apptManagerRepo.findOne.mockResolvedValue(appointment);
      paymentManagerRepo.findOne.mockResolvedValue(payment);
      paymentManagerRepo.save.mockResolvedValue({ ...payment, status: 'paid' });
      apptManagerRepo.save.mockResolvedValue({
        ...appointment,
        status: 'paid',
      });

      await service.handleStripeCheckoutSessionCompleted({
        appointmentId: 'appt-uuid-1',
        sessionId: 'cs_test_done',
      });

      expect(paymentManagerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paid' }),
      );
      expect(apptManagerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paid' }),
      );
      expect(
        notificationService.publishAppointmentStatusChanged,
      ).toHaveBeenCalled();
    });

    it('deve sair silenciosamente se o appointment não for encontrado', async () => {
      apptManagerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.handleStripeCheckoutSessionCompleted({
          appointmentId: 'inexistente',
          sessionId: 'cs_test_x',
        }),
      ).resolves.not.toThrow();

      expect(paymentManagerRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── handleStripeCheckoutSessionExpired ──────────────────────────────────────

  describe('handleStripeCheckoutSessionExpired', () => {
    it('deve marcar payment como failed e voltar appointment para confirmed', async () => {
      const payment = makePayment({ status: 'pending' });
      const appointment = makeAppointment({ status: 'awaiting_payment' });

      paymentManagerRepo.findOne.mockResolvedValue(payment);
      paymentManagerRepo.save.mockResolvedValue({
        ...payment,
        status: 'failed',
      });
      apptManagerRepo.findOne.mockResolvedValue(appointment);
      apptManagerRepo.save.mockResolvedValue({
        ...appointment,
        status: 'confirmed',
      });

      await service.handleStripeCheckoutSessionExpired({
        appointmentId: 'appt-uuid-1',
        sessionId: 'cs_expired',
      });

      expect(paymentManagerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
      expect(apptManagerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'confirmed' }),
      );
    });

    it('não deve alterar payment já paid na expiração', async () => {
      const payment = makePayment({ status: 'paid' });
      const appointment = makeAppointment({ status: 'paid' });

      paymentManagerRepo.findOne.mockResolvedValue(payment);
      apptManagerRepo.findOne.mockResolvedValue(appointment);

      await service.handleStripeCheckoutSessionExpired({
        appointmentId: 'appt-uuid-1',
        sessionId: 'cs_expired',
      });

      expect(paymentManagerRepo.save).not.toHaveBeenCalled();
      expect(apptManagerRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── handleStripePaymentSucceeded ────────────────────────────────────────────

  describe('handleStripePaymentSucceeded', () => {
    it('deve marcar payment e appointment como paid', async () => {
      const payment = makePayment({ status: 'pending' });
      const appointment = makeAppointment({ status: 'awaiting_payment' });

      paymentsRepo.findOne.mockResolvedValue(payment);
      paymentsRepo.save.mockResolvedValue({ ...payment, status: 'paid' });
      queryService.findOne.mockResolvedValue(appointment);
      appointmentsRepo.save.mockResolvedValue({
        ...appointment,
        status: 'paid',
      });

      await service.handleStripePaymentSucceeded('pi_test_123');

      expect(paymentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paid' }),
      );
      expect(appointmentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paid' }),
      );
    });

    it('deve sair silenciosamente se payment não existir', async () => {
      paymentsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.handleStripePaymentSucceeded('pi_nao_existe'),
      ).resolves.not.toThrow();
    });
  });

  // ── handleStripePaymentFailed ───────────────────────────────────────────────

  describe('handleStripePaymentFailed', () => {
    it('deve marcar payment como failed', async () => {
      const payment = makePayment({ status: 'pending' });
      paymentsRepo.findOne.mockResolvedValue(payment);
      paymentsRepo.save.mockResolvedValue({ ...payment, status: 'failed' });

      await service.handleStripePaymentFailed('pi_test_123');

      expect(paymentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('deve sair silenciosamente se payment não existir', async () => {
      paymentsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.handleStripePaymentFailed('pi_nao_existe'),
      ).resolves.not.toThrow();
    });
  });

  // ── verifyPaymentSession ────────────────────────────────────────────────────

  describe('verifyPaymentSession', () => {
    it('deve lançar NotFoundException se a sessão não existir', async () => {
      paymentsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.verifyPaymentSession('cs_inexistente', 'customer-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException se o requester não é o cliente', async () => {
      const payment = makePayment({ checkoutSessionId: 'cs_test_123' });
      const appointment = makeAppointment({ customerId: 'outro-uuid' });

      paymentsRepo.findOne.mockResolvedValue(payment);
      queryService.findOne.mockResolvedValue(appointment);

      await expect(
        service.verifyPaymentSession('cs_test_123', 'customer-uuid'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve retornar o agendamento diretamente se já está paid', async () => {
      const payment = makePayment({ checkoutSessionId: 'cs_test_123' });
      const appointment = makeAppointment({ status: 'paid' });

      paymentsRepo.findOne.mockResolvedValue(payment);
      queryService.findOne.mockResolvedValue(appointment);

      const result = await service.verifyPaymentSession(
        'cs_test_123',
        'customer-uuid',
      );

      expect(result.status).toBe('paid');
    });
  });
});
