/**
 * Testes de integração — ServicesService
 *
 * Rodam contra um banco PostgreSQL real (DATABASE_URL_TEST).
 * São pulados automaticamente quando a variável não está configurada.
 *
 * Para executar:
 *   DATABASE_URL_TEST=postgres://user:pass@localhost:5432/mural_test \
 *     npm run test:integration
 *
 * O banco de teste precisa existir. As tabelas são criadas/destruídas
 * automaticamente via synchronize: true.
 */

import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ServicesService } from './services.service';
import { Service } from './entities/service.entity';
import { User } from '../users/entities/user.entity';
import { Condominium } from '../condominiums/entities/condominium.entity';
import { Appointment } from '../appointments/entities/appointment.entity';
import { Payment } from '../appointments/entities/payment.entity';
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

// ── Factories de dados de teste ───────────────────────────────────────────────

function buildCondominium(partial: Partial<Condominium> = {}): Partial<Condominium> {
  return {
    name: 'Condomínio Teste',
    addressZipCode: '01310-100',
    addressStreet: 'Av. Paulista',
    addressNumber: '100',
    addressCity: 'São Paulo',
    addressState: 'SP',
    ...partial,
  };
}

function buildUser(
  partial: Partial<User> & { condominiumId?: string } = {},
): Partial<User> {
  return {
    cognitoSub: `sub-${Date.now()}-${Math.random()}`,
    email: `test-${Date.now()}@example.com`,
    givenName: 'Prestador',
    familyName: 'Teste',
    displayName: 'Prestador Teste',
    isProvider: true,
    termsAcceptedAt: new Date(),
    authProvider: 'email-password',
    ...partial,
  };
}

function buildService(
  providerId: string,
  condominiumId: string,
  partial: Partial<Service> = {},
): Partial<Service> {
  return {
    name: 'Pintura Residencial',
    description: 'Pintura de alta qualidade',
    price: '350.00',
    contact: '11999999999',
    category: 'Construção e Reformas',
    availableDays: ['seg', 'ter', 'qua'],
    availabilitySlots: null,
    isActive: true,
    providerId,
    condominiumId,
    ...partial,
  };
}

// ── Suíte de testes ───────────────────────────────────────────────────────────

describeIntegration('ServicesService (integração)', () => {
  let ctx: IntegrationTestContext;
  let servicesService: ServicesService;
  let servicesRepo: Repository<Service>;
  let usersRepo: Repository<User>;
  let condosRepo: Repository<Condominium>;

  let testCondo: Condominium;
  let testProvider: User;

  const ALL_ENTITIES = [
    Service, User, Condominium, Appointment, Payment, Review,
    Notification, PushSubscription,
  ];

  beforeAll(async () => {
    ctx = await createIntegrationModule(
      ALL_ENTITIES,
      [],
      [
        ServicesService,
        { provide: MessagingService, useValue: mockMessaging },
      ],
    );

    servicesService = ctx.module.get(ServicesService);
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
      'services', 'appointments', 'payments', 'reviews',
      'notifications', 'push_subscriptions', 'users', 'condominiums',
    ]);
    jest.clearAllMocks();

    // Cria dados base para cada teste
    testCondo = await condosRepo.save(condosRepo.create(buildCondominium()));
    testProvider = await usersRepo.save(
      usersRepo.create(buildUser({ condominiumId: testCondo.id })),
    );
  });

  describe('create', () => {
    it('deve persistir um serviço no banco', async () => {
      const result = await servicesService.create(
        {
          name: 'Limpeza',
          description: 'Limpeza completa',
          price: '200.00',
          contact: '11988888888',
          category: 'Limpeza',
          availableDays: ['seg', 'qua'],
        },
        testProvider,
      );

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Limpeza');
      expect(result.providerId).toBe(testProvider.id);
      expect(result.condominiumId).toBe(testCondo.id);
      expect(result.isActive).toBe(true);

      // Verifica persistência real no banco
      const fromDb = await servicesRepo.findOne({ where: { id: result.id } });
      expect(fromDb).not.toBeNull();
      expect(fromDb!.name).toBe('Limpeza');
    });

    it('deve publicar evento service.created após salvar', async () => {
      await servicesService.create(
        {
          name: 'Jardinagem',
          description: 'Manutenção de jardins',
          price: '150.00',
          contact: '11977777777',
          category: 'Jardinagem',
          availableDays: ['sab'],
        },
        testProvider,
      );

      expect(mockMessaging.publish).toHaveBeenCalledWith(
        'service.created',
        expect.objectContaining({ condominiumId: testCondo.id }),
      );
    });

    it('deve lançar ForbiddenException para usuário sem modo prestador', async () => {
      const customer = await usersRepo.save(
        usersRepo.create(buildUser({ isProvider: false, condominiumId: testCondo.id })),
      );

      await expect(
        servicesService.create(
          {
            name: 'Serviço',
            description: 'Desc',
            price: '100.00',
            contact: '11999999999',
            category: 'Outros',
            availableDays: ['seg'],
          },
          customer,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar ForbiddenException para usuário sem condomínio', async () => {
      const providerSemCondo = await usersRepo.save(
        usersRepo.create(buildUser({ isProvider: true, condominiumId: undefined })),
      );

      await expect(
        servicesService.create(
          {
            name: 'Serviço',
            description: 'Desc',
            price: '100.00',
            contact: '11999999999',
            category: 'Outros',
            availableDays: ['seg'],
          },
          providerSemCondo,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('deve retornar apenas serviços do condomínio solicitado', async () => {
      // Outro condomínio — serviços dele NÃO devem aparecer
      const outroCondo = await condosRepo.save(
        condosRepo.create(buildCondominium({ name: 'Condo Vizinho' })),
      );
      const outroProvider = await usersRepo.save(
        usersRepo.create(buildUser({ condominiumId: outroCondo.id })),
      );

      await servicesRepo.save(servicesRepo.create(buildService(testProvider.id, testCondo.id)));
      await servicesRepo.save(servicesRepo.create(buildService(outroProvider.id, outroCondo.id)));

      const result = await servicesService.findAll(testCondo.id);

      expect(result.every((s) => s.condominiumId === testCondo.id)).toBe(true);
      expect(result.length).toBe(1);
    });

    it('deve retornar apenas serviços ativos', async () => {
      await servicesRepo.save(servicesRepo.create(buildService(testProvider.id, testCondo.id)));
      await servicesRepo.save(
        servicesRepo.create(buildService(testProvider.id, testCondo.id, { isActive: false })),
      );

      const result = await servicesService.findAll(testCondo.id);

      expect(result.length).toBe(1);
      expect(result[0].isActive).toBe(true);
    });
  });

  describe('findOne', () => {
    it('deve retornar o serviço pelo id', async () => {
      const saved = await servicesRepo.save(
        servicesRepo.create(buildService(testProvider.id, testCondo.id)),
      );

      const result = await servicesService.findOne(saved.id);

      expect(result.id).toBe(saved.id);
      expect(result.name).toBe(saved.name);
    });

    it('deve lançar NotFoundException para id inexistente', async () => {
      await expect(
        servicesService.findOne('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('deve atualizar campos do serviço', async () => {
      const saved = await servicesRepo.save(
        servicesRepo.create(buildService(testProvider.id, testCondo.id)),
      );

      const updated = await servicesService.update(
        saved.id,
        { name: 'Pintura Premium', price: '500.00' },
        testProvider,
      );

      expect(updated.name).toBe('Pintura Premium');
      expect(updated.price).toBe('500.00');

      const fromDb = await servicesRepo.findOne({ where: { id: saved.id } });
      expect(fromDb!.name).toBe('Pintura Premium');
    });

    it('deve lançar ForbiddenException quando outro prestador tenta editar', async () => {
      const outroProvider = await usersRepo.save(
        usersRepo.create(buildUser({ condominiumId: testCondo.id })),
      );
      const saved = await servicesRepo.save(
        servicesRepo.create(buildService(testProvider.id, testCondo.id)),
      );

      await expect(
        servicesService.update(saved.id, { name: 'Hack' }, outroProvider),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
