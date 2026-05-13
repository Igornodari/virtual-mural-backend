/**
 * Teste de integração do fluxo crítico:
 *   morador → vira prestador → publica serviço →
 *   outro morador agenda → primeiro vê em "Como prestador",
 *   segundo vê em "Como morador".
 *
 * Em vez de subir o NestJS HTTP completo (que exigiria Postgres + auth
 * Cognito real), exercitamos diretamente os services usando os mesmos
 * mocks de repositório do unit-test, mas wireados ENTRE SI. Isso pega
 * regressões no contrato entre módulos sem custo de infraestrutura.
 */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { AppointmentsService } from './appointments.service';
import { Appointment } from './entities/appointment.entity';
import { Payment } from './entities/payment.entity';
import { Service } from '../services/entities/service.entity';
import { User } from '../users/entities/user.entity';
import { ServicesService } from '../services/services.service';
import { UsersService } from '../users/users.service';
import { MessagingService } from '../messaging/messaging.service';

// ── Fakes de repositório ───────────────────────────────────────────────────
// Implementam só os métodos usados pelos services. Operam contra mapas
// em memória, então o teste se comporta como uma "DB de papel".

function makeUserRepo() {
  const users = new Map<string, User>();
  return {
    _users: users,
    findOne: jest.fn(async ({ where }: any) => {
      if (where?.id) return users.get(where.id) ?? null;
      if (where?.cognitoSub) {
        return [...users.values()].find((u) => u.cognitoSub === where.cognitoSub) ?? null;
      }
      return null;
    }),
    create: jest.fn((data: Partial<User>) => ({ ...data } as User)),
    save: jest.fn(async (user: User) => {
      // Atribui id se for novo
      if (!user.id) user.id = `user-${users.size + 1}`;
      users.set(user.id, user);
      return user;
    }),
    find: jest.fn(async () => [...users.values()]),
  };
}

// Adiciona a UsersService o que falta nos fakes pra os novos guards
function injectExtraUserRepoMethods(userRepo: any) {
  // Não usado diretamente — o UsersService precisa dos repositórios
  // de Service e Appointment. Eles são criados separados (servicesRepo,
  // appointmentsRepo) e injetados na fábrica.
  return userRepo;
}

function makeServiceRepo() {
  const services = new Map<string, Service>();
  return {
    _services: services,
    findOne: jest.fn(async ({ where }: any) => {
      if (where?.id) return services.get(where.id) ?? null;
      return null;
    }),
    find: jest.fn(async ({ where }: any = {}) => {
      let result = [...services.values()];
      if (where?.providerId) {
        result = result.filter((s) => s.providerId === where.providerId);
      }
      if (where?.isActive !== undefined) {
        result = result.filter((s) => s.isActive === where.isActive);
      }
      return result;
    }),
    create: jest.fn(
      (data: Partial<Service>) =>
        ({ ...data, id: `svc-${services.size + 1}` } as Service),
    ),
    save: jest.fn(async (svc: Service) => {
      if (!svc.id) svc.id = `svc-${services.size + 1}`;
      // Espelha o default do Postgres: @Column({ default: true })
      if (svc.isActive === undefined) svc.isActive = true;
      services.set(svc.id, svc);
      return svc;
    }),
    // Usado pelo guard de desativação do modo prestador
    count: jest.fn(async ({ where }: any = {}) => {
      let list = [...services.values()];
      if (where?.providerId) {
        list = list.filter((s) => s.providerId === where.providerId);
      }
      if (where?.isActive !== undefined) {
        list = list.filter((s) => s.isActive === where.isActive);
      }
      return list.length;
    }),
  };
}

function makeAppointmentRepo() {
  const appointments = new Map<string, Appointment>();
  const repo = {
    _appointments: appointments,
    find: jest.fn(async ({ where }: any = {}) => {
      let list = [...appointments.values()];
      if (where?.customerId) {
        list = list.filter((a) => a.customerId === where.customerId);
      }
      // Hidrata a relation 'service' com a service do servicesRepo
      return list.map((a) => ({
        ...a,
        service: serviceRepoRef!._services.get(a.serviceId),
      })) as Appointment[];
    }),
    findOne: jest.fn(async ({ where }: any) => {
      if (where?.id) return appointments.get(where.id) ?? null;
      return null;
    }),
    // O createQueryBuilder é o caminho usado em `findByProvider` e
    // `findServiceBlockedSlots`. Implementação minimalista que cobre
    // os métodos efetivamente usados nos testes.
    createQueryBuilder: jest.fn(() => {
      let providerFilter: string | null = null;
      let statusFilter: string[] | null = null;
      const builder: any = {
        leftJoinAndSelect: () => builder,
        innerJoin: () => builder,
        where: (sql: string, params: any) => {
          if (sql.includes('service.providerId') || sql.includes('providerId')) {
            providerFilter = params.providerId ?? params.userId;
          }
          return builder;
        },
        andWhere: (sql: string, params: any) => {
          if (sql.includes('appointment.status IN')) {
            statusFilter = params.statuses;
          }
          return builder;
        },
        orderBy: () => builder,
        addOrderBy: () => builder,
        setLock: () => builder,
        select: () => builder,
        addSelect: () => builder,
        groupBy: () => builder,
        addGroupBy: () => builder,
        getMany: async () => {
          const filter = (a: Appointment) => {
            const svc = serviceRepoRef!._services.get(a.serviceId);
            return providerFilter ? svc?.providerId === providerFilter : true;
          };
          return [...appointments.values()].filter(filter).map((a) => ({
            ...a,
            service: serviceRepoRef!._services.get(a.serviceId),
          }));
        },
        getOne: async () => null,
        getRawMany: async () => [],
        getCount: async () => {
          const filter = (a: Appointment) => {
            const svc = serviceRepoRef!._services.get(a.serviceId);
            if (providerFilter && svc?.providerId !== providerFilter) return false;
            if (statusFilter && !statusFilter.includes(a.status)) return false;
            return true;
          };
          return [...appointments.values()].filter(filter).length;
        },
      };
      return builder;
    }),
    manager: {
      transaction: jest.fn(async (cb: any) => {
        const manager = {
          getRepository: (entity: any) => {
            if (entity === Service) return serviceRepoRef!;
            if (entity === Appointment) {
              return {
                create: (data: any) => ({
                  ...data,
                  id: `appt-${appointments.size + 1}`,
                }),
                save: async (data: Appointment) => {
                  if (!data.id) data.id = `appt-${appointments.size + 1}`;
                  appointments.set(data.id, data);
                  return data;
                },
                findOne: async () => null,
                createQueryBuilder: () => ({
                  setLock: () => ({
                    where: () => ({
                      andWhere: () => ({
                        andWhere: () => ({
                          andWhere: () => ({ getOne: async () => null }),
                        }),
                      }),
                    }),
                  }),
                }),
              };
            }
            return {};
          },
        };
        return cb(manager);
      }),
    },
  };
  return repo;
}

// Referência mutável compartilhada entre repos — evita ciclo de
// dependência na construção dos fakes.
let serviceRepoRef: ReturnType<typeof makeServiceRepo> | null = null;

describe('Fluxo crítico: morador → prestador → agendamento', () => {
  let usersService: UsersService;
  let servicesService: ServicesService;
  let appointmentsService: AppointmentsService;
  let userRepo: ReturnType<typeof makeUserRepo>;
  let appointmentRepo: ReturnType<typeof makeAppointmentRepo>;
  let messaging: { publish: jest.Mock };

  beforeEach(async () => {
    userRepo = makeUserRepo();
    serviceRepoRef = makeServiceRepo();
    appointmentRepo = makeAppointmentRepo();
    messaging = { publish: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        ServicesService,
        AppointmentsService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Service), useValue: serviceRepoRef },
        { provide: getRepositoryToken(Appointment), useValue: appointmentRepo },
        {
          provide: getRepositoryToken(Payment),
          useValue: { createQueryBuilder: () => ({ leftJoinAndSelect: () => ({ where: () => ({ andWhere: () => ({ andWhere: () => ({ andWhere: () => ({ orderBy: () => ({ getMany: async () => [] }) }) }) }) }) }) }) },
        },
        { provide: MessagingService, useValue: messaging },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: 'PAYMENT_GATEWAY', useValue: {} },
      ],
    }).compile();

    usersService = moduleRef.get(UsersService);
    servicesService = moduleRef.get(ServicesService);
    appointmentsService = moduleRef.get(AppointmentsService);
  });

  it('executa o fluxo ponta a ponta corretamente', async () => {
    // ── 1) Onboarding de dois usuários como moradores do mesmo condomínio
    const alice = await usersService.findOrCreateByCognito({
      cognitoSub: 'sub-alice',
      email: 'alice@example.com',
      givenName: 'Alice',
    });
    const bob = await usersService.findOrCreateByCognito({
      cognitoSub: 'sub-bob',
      email: 'bob@example.com',
      givenName: 'Bob',
    });

    await usersService.updateOnboarding(alice.id, { condominiumId: 'condo-X' });
    await usersService.updateOnboarding(bob.id, { condominiumId: 'condo-X' });

    // ── 2) Alice vira prestador
    await usersService.updateOnboarding(alice.id, { isProvider: true });
    const aliceWithProviderRole = (await usersService.findById(alice.id))!;
    expect(aliceWithProviderRole.isProvider).toBe(true);

    // ── 3) Alice publica serviço
    const aliceService = await servicesService.create(
      {
        name: 'Aulas de violão',
        description: 'Iniciante e intermediário',
        category: 'tutoring',
        price: '80',
        contact: '+5511988887777',
        availableDays: ['monday', 'wednesday'],
      } as any,
      aliceWithProviderRole,
    );
    expect(aliceService.providerId).toBe(alice.id);

    // ── 3a) Bob (que NÃO é prestador) NÃO consegue criar serviço
    await expect(
      servicesService.create(
        { name: 'X', availableDays: ['friday'] } as any,
        (await usersService.findById(bob.id))!,
      ),
    ).rejects.toThrow(/prestador/i);

    // ── 4) Bob agenda no serviço da Alice
    const bobFresh = (await usersService.findById(bob.id))!;
    const appointment = await appointmentsService.create(
      {
        serviceId: aliceService.id,
        scheduledDate: '2026-06-01',
        scheduledDay: 'monday',
        scheduledTime: '14:00',
      } as any,
      bobFresh,
    );
    expect(appointment.customerId).toBe(bob.id);

    // ── 4a) Alice NÃO pode agendar no próprio serviço
    await expect(
      appointmentsService.create(
        {
          serviceId: aliceService.id,
          scheduledDate: '2026-06-08',
          scheduledDay: 'monday',
          scheduledTime: '14:00',
        } as any,
        (await usersService.findById(alice.id))!,
      ),
    ).rejects.toThrow(/próprio/i);

    // ── 5) findMine para Alice (prestador): vê 1 item tagueado provider
    const aliceList = await appointmentsService.findMine(
      (await usersService.findById(alice.id))!,
    );
    expect(aliceList).toHaveLength(1);
    expect(aliceList[0].viewerRole).toBe('provider');
    expect(aliceList[0].customerId).toBe(bob.id);

    // ── 6) findMine para Bob (apenas morador): vê 1 item tagueado customer
    const bobList = await appointmentsService.findMine(bobFresh);
    expect(bobList).toHaveLength(1);
    expect(bobList[0].viewerRole).toBe('customer');
    expect(bobList[0].customerId).toBe(bob.id);
  });

  it('desativar modo prestador é bloqueado quando há serviço ativo (novo guard)', async () => {
    // Setup mínimo
    const alice = await usersService.findOrCreateByCognito({
      cognitoSub: 'sub-a',
      email: 'a@e.com',
    });
    const bob = await usersService.findOrCreateByCognito({
      cognitoSub: 'sub-b',
      email: 'b@e.com',
    });
    await usersService.updateOnboarding(alice.id, { condominiumId: 'condo-Y' });
    await usersService.updateOnboarding(bob.id, { condominiumId: 'condo-Y' });
    await usersService.updateOnboarding(alice.id, { isProvider: true });

    const svc = await servicesService.create(
      { name: 'X', availableDays: ['monday'] } as any,
      (await usersService.findById(alice.id))!,
    );
    await appointmentsService.create(
      {
        serviceId: svc.id,
        scheduledDate: '2026-07-06',
        scheduledDay: 'monday',
        scheduledTime: '10:00',
      } as any,
      (await usersService.findById(bob.id))!,
    );

    // Alice tenta desativar modo prestador → bloqueado porque tem
    // serviço ativo + appointment em aberto.
    await expect(
      usersService.updateOnboarding(alice.id, { isProvider: false }),
    ).rejects.toThrow(/serviço/i);
  });
});
