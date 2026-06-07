/**
 * Testes de integração — AppointmentsService
 *
 * Rodam contra um banco PostgreSQL real (DATABASE_URL_TEST).
 * São pulados automaticamente quando a variável não está configurada.
 *
 * Para executar:
 *   DATABASE_URL_TEST=postgres://user:pass@localhost:5432/mural_test \
 *     npm run test:integration
 */

import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AppointmentsService, AppointmentWithViewerRole } from './appointments.service';
import { Appointment } from './entities/appointment.entity';
import { Payment } from './entities/payment.entity';
import { Service } from '../services/entities/service.entity';
import { User } from '../users/entities/user.entity';
import { Condominium } from '../condominiums/entities/condominium.entity';
import { Review } from '../reviews/entities/review.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { PushSubscription } from '../notifications/entities/push-subscription.entity';
import { MessagingService } from '../messaging/messaging.service';
import {
  describeIntegration,
  createIntegrationModule,
  clearTables,
  type IntegrationTestContext,
} from '../test/integration-helpers';

// ── Mocks de dependências externas ───────────────────────────────────────────

const mockMessaging = {
  publish: jest.fn().mockResolvedValue(undefined),
  consume: jest.fn().mockResolvedValue(undefined),
  isHealthy: jest.fn().mockReturnValue(true),
};

const mockPaymentGateway = {
  createCheckoutSession: jest.fn().mockResolvedValue({
    id: 'cs_test_123',
    url: 'https://checkout.stripe.com/test',
  }),
  retrieveSession: jest.fn(),
};

// ── Factories de dados de teste ───────────────────────────────────────────────

function buildCondominium(): Partial<Condominium> {
  return {
    name: 'Condo Integração',
    addressZipCode: '01310-100',
    addressStreet: 'Av. Paulista',
    addressNumber: '1',
    addressCity: 'São Paulo',
    addressState: 'SP',
  };
}

function buildUser(overrides: Partial<User> & { condominiumId?: string } = {}): Partial<User> {
  return {
    cognitoSub: `sub-${Date.now()}-${Math.random()}`,
    email: `test-${Date.now()}-${Math.random()}@example.com`,
    givenName: 'Test',
    familyName: 'User',
    displayName: 'Test User',
    isProvider: false,
    termsAcceptedAt: new Date(),
    authProvider: 'email-password',
    ...overrides,
  };
}

// availableDays usa nomes completos para que normalizeDay('Terça-feira') === normalizeDay('Terça-feira')
function buildService(providerId: string, condominiumId: string): Partial<Service> {
  return {
    name: 'Serviço de Teste',
    description: 'Para testes de integração',
    price: '100.00',
    contact: '11999999999',
    category: 'Outros',
    availableDays: [
      'Segunda-feira',
      'Terça-feira',
      'Quarta-feira',
      'Quinta-feira',
      'Sexta-feira',
      'Sábado',
      'Domingo',
    ],
    availabilitySlots: null,
    isActive: true,
    providerId,
    condominiumId,
  };
}

// ── Suíte de testes ───────────────────────────────────────────────────────────

describeIntegration('AppointmentsService (integração)', () => {
  let ctx: IntegrationTestContext;
  let appointmentsService: AppointmentsService;
  let appointmentsRepo: Repository<Appointment>;
  let servicesRepo: Repository<Service>;
  let usersRepo: Repository<User>;
  let condosRepo: Repository<Condominium>;

  let testCondo: Condominium;
  let testCustomer: User;
  let testProvider: User;
  let testService: Service;

  const ALL_ENTITIES = [
    Appointment, Payment, Service, User, Condominium,
    Review, Notification, PushSubscription,
  ];

  beforeAll(async () => {
    ctx = await createIntegrationModule(
      ALL_ENTITIES,
      [ConfigModule.forRoot({ isGlobal: true })],
      [
        AppointmentsService,
        { provide: MessagingService, useValue: mockMessaging },
        { provide: 'PAYMENT_GATEWAY', useValue: mockPaymentGateway },
      ],
    );

    appointmentsService = ctx.module.get(AppointmentsService);
    appointmentsRepo = ctx.module.get(getRepositoryToken(Appointment));
    servicesRepo = ctx.module.get(getRepositoryToken(Service));
    usersRepo = ctx.module.get(getRepositoryToken(User));
    condosRepo = ctx.module.get(getRepositoryToken(Condominium));
  });

  afterAll(async () => {
    await ctx.dataSource.destroy();
    await ctx.module.close();
  });

  beforeEach(async () => {
    await clearTables(ctx.dataSource, [
      'appointments', 'payments', 'reviews', 'services',
      'notifications', 'push_subscriptions', 'users', 'condominiums',
    ]);
    jest.clearAllMocks();

    testCondo = await condosRepo.save(condosRepo.create(buildCondominium()));
    testCustomer = await usersRepo.save(
      usersRepo.create(buildUser({ condominiumId: testCondo.id, isProvider: false })),
    );
    testProvider = await usersRepo.save(
      usersRepo.create(buildUser({ condominiumId: testCondo.id, isProvider: true })),
    );
    testService = await servicesRepo.save(
      servicesRepo.create(buildService(testProvider.id, testCondo.id)),
    );
  });

  describe('create', () => {
    it('deve criar agendamento e persistir no banco', async () => {
      const result: Appointment = await appointmentsService.create(
        {
          serviceId: testService.id,
          scheduledDate: '2026-07-15',
          scheduledDay: 'Quarta-feira',
          scheduledTime: '10:00',
          notes: 'Teste de integração',
        },
        testCustomer,
      );

      expect(result.id).toBeDefined();
      expect(result.customerId).toBe(testCustomer.id);
      expect(result.serviceId).toBe(testService.id);
      expect(result.status).toBe('pending');

      const fromDb = await appointmentsRepo.findOne({ where: { id: result.id } });
      expect(fromDb).not.toBeNull();
      expect(fromDb!.scheduledDate).toBe('2026-07-15');
    });

    it('deve publicar evento appointment.requested após criar', async () => {
      await appointmentsService.create(
        {
          serviceId: testService.id,
          scheduledDate: '2026-07-21',
          scheduledDay: 'Terça-feira',
          scheduledTime: '14:00',
        },
        testCustomer,
      );

      expect(mockMessaging.publish).toHaveBeenCalledWith(
        'appointment.requested',
        expect.objectContaining({ serviceId: testService.id }),
      );
    });

    it('deve lançar NotFoundException para serviceId inexistente', async () => {
      await expect(
        appointmentsService.create(
          {
            serviceId: '00000000-0000-0000-0000-000000000000',
            scheduledDate: '2026-07-15',
            scheduledDay: 'Quarta-feira',
            scheduledTime: '10:00',
          },
          testCustomer,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve impedir prestador de agendar seu próprio serviço', async () => {
      await expect(
        appointmentsService.create(
          {
            serviceId: testService.id,
            scheduledDate: '2026-07-15',
            scheduledDay: 'Quarta-feira',
            scheduledTime: '10:00',
          },
          testProvider, // prestador tentando agendar seu próprio serviço
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findMine', () => {
    it('deve retornar agendamentos do customer com viewerRole=customer', async () => {
      await appointmentsService.create(
        {
          serviceId: testService.id,
          scheduledDate: '2026-08-01',
          scheduledDay: 'Sábado',
          scheduledTime: '09:00',
        },
        testCustomer,
      );

      const result: AppointmentWithViewerRole[] = await appointmentsService.findMine(testCustomer);

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((a) => a.viewerRole === 'customer')).toBe(true);
    });

    it('deve retornar agendamentos do provider com viewerRole=provider', async () => {
      await appointmentsService.create(
        {
          serviceId: testService.id,
          scheduledDate: '2026-08-02',
          scheduledDay: 'Domingo',
          scheduledTime: '11:00',
        },
        testCustomer,
      );

      const result: AppointmentWithViewerRole[] = await appointmentsService.findMine(testProvider);

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((a) => a.viewerRole === 'provider')).toBe(true);
    });

    it('não deve retornar agendamentos de outros usuários', async () => {
      const outroCustomer = await usersRepo.save(
        usersRepo.create(buildUser({ condominiumId: testCondo.id })),
      );

      await appointmentsService.create(
        {
          serviceId: testService.id,
          scheduledDate: '2026-08-03',
          scheduledDay: 'Segunda-feira',
          scheduledTime: '15:00',
        },
        outroCustomer,
      );

      // testCustomer não fez nenhum agendamento
      const result: AppointmentWithViewerRole[] = await appointmentsService.findMine(testCustomer);
      expect(result.length).toBe(0);
    });
  });

  describe('updateStatus', () => {
    it('deve atualizar status do agendamento', async () => {
      const appointment: Appointment = await appointmentsService.create(
        {
          serviceId: testService.id,
          scheduledDate: '2026-09-01',
          scheduledDay: 'Terça-feira',
          scheduledTime: '10:00',
        },
        testCustomer,
      );

      const updated: Appointment = await appointmentsService.updateStatus(
        appointment.id,
        { status: 'confirmed' },
        testProvider.id,
      );

      expect(updated.status).toBe('confirmed');

      const fromDb = await appointmentsRepo.findOne({ where: { id: appointment.id } });
      expect(fromDb!.status).toBe('confirmed');
    });

    it('deve lançar ForbiddenException quando usuário não autorizado tenta mudar status', async () => {
      const appointment: Appointment = await appointmentsService.create(
        {
          serviceId: testService.id,
          scheduledDate: '2026-09-03',
          scheduledDay: 'Quinta-feira',
          scheduledTime: '10:00',
        },
        testCustomer,
      );

      const outroUser = await usersRepo.save(
        usersRepo.create(buildUser({ condominiumId: testCondo.id })),
      );

      await expect(
        appointmentsService.updateStatus(
          appointment.id,
          { status: 'confirmed' },
          outroUser.id,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
