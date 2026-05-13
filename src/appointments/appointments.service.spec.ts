/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await --
   Specs e fakes de repositório usam `any` deliberadamente para simular a
   API do TypeORM sem precisar implementar todos os métodos. As checagens
   de segurança não se aplicam a mocks. */
/**
 * Testes do AppointmentsService. Foco nas regras de negócio críticas
 * para a release: bloqueio de auto-agendamento, tagging correto de
 * viewerRole em findMine, ACL de findByService e validações de criação.
 *
 * Estratégia: mockamos os repositórios e o manager de transação para
 * isolar as regras puras. Cenários do Stripe são apenas tocados
 * (mockamos `paymentsRepo` retornando vazio) porque a lógica de
 * pagamento tem seus próprios testes separados.
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { AppointmentsService } from './appointments.service';
import { Appointment } from './entities/appointment.entity';
import { Payment } from './entities/payment.entity';
import { Service } from '../services/entities/service.entity';
import { User } from '../users/entities/user.entity';
import { MessagingService } from '../messaging/messaging.service';

// ── Fábricas de mocks ──────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-default',
    cognitoSub: 'sub-default',
    email: 'user@example.com',
    givenName: 'User',
    familyName: 'Test',
    displayName: 'User Test',
    phone: '+5511999999999',
    avatarUrl: '',
    cognitoUsername: 'user',
    authProvider: 'cognito',
    isProvider: false,
    onboardingCompleted: true,
    addressCompleted: true,
    condominium: null,
    condominiumId: 'condo-1',
    services: [],
    appointments: [],
    reviews: [],
    stripeAccountId: null,
    stripeAccountStatus: null,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as User;
}

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'service-1',
    name: 'Corte de cabelo',
    description: 'Cortes em domicílio',
    category: 'beauty',
    price: '50',
    contact: '+5511988887777',
    isActive: true,
    providerId: 'provider-1',
    condominiumId: 'condo-1',
    availableDays: ['monday', 'tuesday'],
    availabilitySlots: [],
    clicks: 0,
    interests: 0,
    completions: 0,
    abandonments: 0,
    rating: 0,
    totalReviews: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Service;
}

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1',
    customerId: 'user-default',
    serviceId: 'service-1',
    scheduledDate: '2026-06-01',
    scheduledDay: 'monday',
    scheduledTime: '10:00',
    notes: '',
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Appointment;
}

// Helper: cria um query builder que se comporta como um stub fluente.
// Cada método retorna `this` para permitir encadear; `getOne`, `getMany`
// e `getRawMany` retornam o valor que o teste configurar.
function makeQueryBuilder(results: {
  one?: unknown;
  many?: unknown;
  rawMany?: unknown;
}) {
  const qb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(results.one ?? null),
    getMany: jest.fn().mockResolvedValue(results.many ?? []),
    getRawMany: jest.fn().mockResolvedValue(results.rawMany ?? []),
  };
  return qb;
}

describe('AppointmentsService', () => {
  let service: AppointmentsService;

  // Repositórios. Cada teste pode reconfigurar os métodos via .mockResolvedValueOnce
  let appointmentsRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let servicesRepo: { findOne: jest.Mock };
  let paymentsRepo: { createQueryBuilder: jest.Mock };
  let messaging: { publish: jest.Mock };
  let paymentGateway: object;

  beforeEach(async () => {
    appointmentsRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() =>
        makeQueryBuilder({ many: [], one: null }),
      ),
      manager: {
        // Por padrão a transação executa o callback com um manager mockado
        // que devolve a service stub-ada e cria um appointment ecoando o
        // input. Testes específicos podem sobrescrever este comportamento.
        transaction: jest.fn(),
      },
    };
    servicesRepo = { findOne: jest.fn() };
    paymentsRepo = {
      createQueryBuilder: jest.fn(() => makeQueryBuilder({ many: [] })),
    };
    messaging = { publish: jest.fn().mockResolvedValue(undefined) };
    paymentGateway = {};

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        {
          provide: getRepositoryToken(Appointment),
          useValue: appointmentsRepo,
        },
        { provide: getRepositoryToken(Service), useValue: servicesRepo },
        { provide: getRepositoryToken(Payment), useValue: paymentsRepo },
        { provide: MessagingService, useValue: messaging },
        {
          provide: ConfigService,
          // Sem STRIPE_SECRET_KEY → service.stripe = null. As branches de
          // sincronização de pagamentos pulam cedo, o que é exatamente o
          // que queremos para isolar a lógica de papéis.
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
        { provide: 'PAYMENT_GATEWAY', useValue: paymentGateway },
      ],
    }).compile();

    service = moduleRef.get(AppointmentsService);
  });

  // ── create() ────────────────────────────────────────────────────────────

  describe('create', () => {
    /**
     * Helper que prepara o transaction manager para devolver a service
     * configurada e ecoar o appointment salvo. Isolamos esse setup
     * porque praticamente todo teste de `create` precisa dele.
     */
    function arrangeTransaction(svc: Service | null) {
      appointmentsRepo.manager.transaction.mockImplementation(
        async (cb: any) => {
          const manager = {
            getRepository: (entity: unknown) => {
              if (entity === Service) {
                return {
                  findOne: jest.fn().mockResolvedValue(svc),
                };
              }
              if (entity === Appointment) {
                return {
                  createQueryBuilder: jest.fn(() =>
                    makeQueryBuilder({ one: null }),
                  ),
                  create: jest.fn().mockImplementation((data) => ({
                    ...data,
                    id: 'appt-new',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  })),
                  save: jest.fn().mockImplementation(async (data) => data),
                };
              }
              return {};
            },
          };
          return cb(manager);
        },
      );
    }

    it('rejeita usuário sem condomínio', async () => {
      const customer = makeUser({ condominiumId: null });

      await expect(
        service.create(
          {
            serviceId: 'service-1',
            scheduledDate: '2026-06-01',
            scheduledDay: 'monday',
          } as any,
          customer,
        ),
      ).rejects.toThrow(ForbiddenException);

      // Não deve sequer iniciar a transação
      expect(appointmentsRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('rejeita quando o serviço não existe', async () => {
      arrangeTransaction(null);
      const customer = makeUser();

      await expect(
        service.create(
          {
            serviceId: 'service-1',
            scheduledDate: '2026-06-01',
            scheduledDay: 'monday',
          } as any,
          customer,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejeita serviço inativo', async () => {
      arrangeTransaction(makeService({ isActive: false }));
      const customer = makeUser();

      await expect(
        service.create(
          {
            serviceId: 'service-1',
            scheduledDate: '2026-06-01',
            scheduledDay: 'monday',
          } as any,
          customer,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita auto-agendamento (prestador agendando o próprio serviço)', async () => {
      arrangeTransaction(
        makeService({ providerId: 'user-default', availableDays: ['monday'] }),
      );
      const customer = makeUser({ id: 'user-default' });

      await expect(
        service.create(
          {
            serviceId: 'service-1',
            scheduledDate: '2026-06-01',
            scheduledDay: 'monday',
          } as any,
          customer,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejeita agendamento em dia fora dos availableDays', async () => {
      arrangeTransaction(
        makeService({ availableDays: ['tuesday', 'wednesday'] }),
      );
      const customer = makeUser({ id: 'user-default' });

      await expect(
        service.create(
          {
            serviceId: 'service-1',
            scheduledDate: '2026-06-01',
            scheduledDay: 'monday',
          } as any,
          customer,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('aceita agendamento válido e dispara evento de mensageria', async () => {
      arrangeTransaction(
        makeService({
          providerId: 'other-provider',
          availableDays: ['monday'],
        }),
      );
      // Quando o save final é chamado, é dentro do servicesRepo via
      // manager.findOne(provider). Mock global do servicesRepo para
      // devolver service+provider quando consultado fora da transação.
      servicesRepo.findOne = jest.fn();

      const customer = makeUser({ id: 'user-default' });

      // Ajusta a transação para também responder ao findOne do
      // serviceWithProvider, no final do método.
      appointmentsRepo.manager.transaction.mockImplementation(
        async (cb: any) => {
          const manager = {
            getRepository: (entity: unknown) => {
              if (entity === Service) {
                return {
                  findOne: jest.fn().mockImplementation(({ relations }) => {
                    if (relations?.includes('provider')) {
                      return Promise.resolve({
                        ...makeService({
                          providerId: 'other-provider',
                          availableDays: ['monday'],
                        }),
                        provider: makeUser({
                          id: 'other-provider',
                          email: 'p@example.com',
                          displayName: 'Provider',
                        }),
                      });
                    }
                    return Promise.resolve(
                      makeService({
                        providerId: 'other-provider',
                        availableDays: ['monday'],
                      }),
                    );
                  }),
                };
              }
              if (entity === Appointment) {
                return {
                  createQueryBuilder: jest.fn(() =>
                    makeQueryBuilder({ one: null }),
                  ),
                  create: jest.fn().mockImplementation((data) => ({
                    ...data,
                    id: 'appt-new',
                  })),
                  save: jest.fn().mockImplementation(async (d) => d),
                };
              }
              return {};
            },
          };
          return cb(manager);
        },
      );

      const saved = await service.create(
        {
          serviceId: 'service-1',
          scheduledDate: '2026-06-01',
          scheduledDay: 'monday',
          scheduledTime: '10:00',
        } as any,
        customer,
      );

      expect(saved).toMatchObject({
        customerId: 'user-default',
        serviceId: 'service-1',
        status: 'pending',
      });
      expect(messaging.publish).toHaveBeenCalledTimes(1);
    });
  });

  // ── findMine() ──────────────────────────────────────────────────────────

  describe('findMine', () => {
    it('rejeita usuário sem condomínio', async () => {
      const user = makeUser({ condominiumId: null });
      await expect(service.findMine(user)).rejects.toThrow(ForbiddenException);
    });

    it('retorna lista vazia quando não há agendamentos', async () => {
      const user = makeUser({ id: 'user-1' });
      // findByCustomer chama appointmentsRepo.find
      appointmentsRepo.find.mockResolvedValue([]);
      // findByProvider chama appointmentsRepo.createQueryBuilder().getMany
      appointmentsRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ many: [] }),
      );

      const result = await service.findMine(user);
      expect(result).toEqual([]);
    });

    it('tagueia appointment como customer quando o usuário é o cliente', async () => {
      const user = makeUser({ id: 'user-1', isProvider: false });
      const customerAppt = makeAppointment({
        id: 'a1',
        customerId: 'user-1',
        serviceId: 'svc-x',
      });
      appointmentsRepo.find.mockResolvedValue([customerAppt]);
      appointmentsRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ many: [] }),
      );

      const result = await service.findMine(user);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'a1', viewerRole: 'customer' });
    });

    it('tagueia appointment como provider quando o usuário é o dono do serviço', async () => {
      const user = makeUser({ id: 'provider-1', isProvider: true });
      const providerAppt = makeAppointment({
        id: 'a2',
        customerId: 'other-customer',
        serviceId: 'svc-y',
      });
      appointmentsRepo.find.mockResolvedValue([]);
      appointmentsRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ many: [providerAppt] }),
      );

      const result = await service.findMine(user);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'a2', viewerRole: 'provider' });
    });

    it('retorna ambas as listas tagueadas corretamente', async () => {
      const user = makeUser({ id: 'mixed-user', isProvider: true });
      const asCustomer = makeAppointment({
        id: 'a1',
        customerId: 'mixed-user',
      });
      const asProvider = makeAppointment({
        id: 'a2',
        customerId: 'someone-else',
      });
      appointmentsRepo.find.mockResolvedValue([asCustomer]);
      appointmentsRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ many: [asProvider] }),
      );

      const result = await service.findMine(user);

      const byId = Object.fromEntries(result.map((r) => [r.id, r.viewerRole]));
      expect(byId).toEqual({ a1: 'customer', a2: 'provider' });
    });

    it('filtra auto-agendamentos legados da lista de prestador (não duplica)', async () => {
      // Cenário: dado sujo onde o mesmo usuário é cliente e prestador.
      // findByCustomer e findByProvider devolvem o MESMO appointment.
      // Esperamos uma única entrada, tagueada como customer (a lista de
      // cliente é processada primeiro e a de prestador descarta o
      // próprio id).
      const user = makeUser({ id: 'self', isProvider: true });
      const selfAppt = makeAppointment({ id: 'self-appt', customerId: 'self' });

      appointmentsRepo.find.mockResolvedValue([selfAppt]);
      appointmentsRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ many: [selfAppt] }),
      );

      const result = await service.findMine(user);
      expect(result).toHaveLength(1);
      expect(result[0].viewerRole).toBe('customer');
    });

    it('ordena por scheduledDate desc', async () => {
      const user = makeUser({ id: 'u', isProvider: false });
      const older = makeAppointment({
        id: 'older',
        scheduledDate: '2026-01-01',
      });
      const newer = makeAppointment({
        id: 'newer',
        scheduledDate: '2026-12-31',
      });

      appointmentsRepo.find.mockResolvedValue([older, newer]);
      appointmentsRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ many: [] }),
      );

      const result = await service.findMine(user);
      expect(result.map((r) => r.id)).toEqual(['newer', 'older']);
    });
  });

  // ── findByService() ─────────────────────────────────────────────────────

  describe('findByService', () => {
    it('rejeita quando o serviço não existe', async () => {
      servicesRepo.findOne.mockResolvedValue(null);
      const requester = makeUser();

      await expect(service.findByService('missing', requester)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('devolve a lista completa para o prestador do serviço', async () => {
      const svc = makeService({ providerId: 'provider-1' });
      servicesRepo.findOne.mockResolvedValue(svc);
      const fullList = [makeAppointment(), makeAppointment({ id: 'appt-2' })];
      appointmentsRepo.find.mockResolvedValue(fullList);

      const requester = makeUser({ id: 'provider-1' });
      const result = await service.findByService(svc.id, requester);

      // Quando é o prestador, esperamos um array; outros papéis recebem
      // ServiceAvailabilityResponse (objeto com blockedSlots).
      expect(Array.isArray(result)).toBe(true);
      expect((result as unknown[]).length).toBe(2);
    });

    it('devolve apenas blockedSlots para outro morador do MESMO condomínio (não expõe dados de cliente)', async () => {
      const svc = makeService({
        providerId: 'provider-1',
        condominiumId: 'condo-1',
      });
      servicesRepo.findOne.mockResolvedValue(svc);
      appointmentsRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({
          rawMany: [{ scheduledDate: '2026-06-01', scheduledTime: '10:00' }],
        }),
      );

      const requester = makeUser({
        id: 'other-resident',
        condominiumId: 'condo-1',
      });
      const result = await service.findByService(svc.id, requester);

      expect(Array.isArray(result)).toBe(false);
      expect((result as any).blockedSlots).toBeDefined();
      expect((result as any).blockedSlots[0]).not.toHaveProperty('customerId');
    });

    it('rejeita morador de OUTRO condomínio (privacy leak)', async () => {
      // Esse é o teste de regressão da vulnerabilidade descoberta durante
      // o desenvolvimento: antes da correção, qualquer morador podia ver
      // os blockedSlots de qualquer serviço, independente do condomínio.
      const svc = makeService({
        providerId: 'provider-1',
        condominiumId: 'condo-A',
      });
      servicesRepo.findOne.mockResolvedValue(svc);

      const intruder = makeUser({
        id: 'other-condo',
        condominiumId: 'condo-B',
      });
      await expect(service.findByService(svc.id, intruder)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejeita usuário sem condomínio', async () => {
      const svc = makeService({ providerId: 'provider-1' });
      servicesRepo.findOne.mockResolvedValue(svc);

      const requester = makeUser({
        id: 'wanderer',
        condominiumId: null,
      });

      await expect(service.findByService(svc.id, requester)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── findOneForUser() ────────────────────────────────────────────────────

  describe('findOneForUser', () => {
    it('permite acesso ao cliente do agendamento', async () => {
      appointmentsRepo.findOne.mockResolvedValue(
        makeAppointment({
          customerId: 'me',
          service: { provider: { id: 'p1' } },
        } as any),
      );
      const result = await service.findOneForUser('appt-1', 'me');
      expect(result).toBeDefined();
    });

    it('permite acesso ao prestador do serviço', async () => {
      appointmentsRepo.findOne.mockResolvedValue(
        makeAppointment({
          customerId: 'someone',
          service: { provider: { id: 'me' } },
        } as any),
      );
      const result = await service.findOneForUser('appt-1', 'me');
      expect(result).toBeDefined();
    });

    it('rejeita acesso a terceiros', async () => {
      appointmentsRepo.findOne.mockResolvedValue(
        makeAppointment({
          customerId: 'a',
          service: { provider: { id: 'b' } },
        } as any),
      );
      await expect(service.findOneForUser('appt-1', 'intruso')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
