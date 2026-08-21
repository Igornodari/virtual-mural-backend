import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ServicesService } from './services.service';
import { Service } from './entities/service.entity';
import { MessagingService } from '../messaging/messaging.service';
import { User } from '../users/entities/user.entity';

const mockProvider = (): User =>
  ({
    id: 'provider-uuid',
    isProvider: true,
    condominiumId: 'condo-uuid',
    displayName: 'Prestador Teste',
    email: 'prestador@example.com',
  }) as unknown as User;

const mockService = (): Service =>
  ({
    id: 'service-uuid-1',
    name: 'Serviço de Pintura',
    description: 'Pintura residencial',
    price: '250.00',
    contact: '11999999999',
    category: 'Construção e Reformas',
    availableDays: ['seg', 'ter'],
    availabilitySlots: null,
    rating: 0,
    totalReviews: 0,
    isActive: true,
    clicks: 0,
    interests: 0,
    completions: 0,
    abandonments: 0,
    providerId: 'provider-uuid',
    condominiumId: 'condo-uuid',
    reviews: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as Service;

type MockRepo<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;
const createMockRepo = <T extends object>(): MockRepo<T> => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  count: jest.fn(),
});

describe('ServicesService', () => {
  let service: ServicesService;
  let repo: MockRepo<Service>;
  let messagingService: { publish: jest.Mock };

  beforeEach(async () => {
    repo = createMockRepo<Service>();
    messagingService = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        { provide: getRepositoryToken(Service), useValue: repo },
        { provide: MessagingService, useValue: messagingService },
      ],
    }).compile();

    service = module.get<ServicesService>(ServicesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('deve criar serviço e publicar evento', async () => {
      const provider = mockProvider();
      const svc = mockService();
      repo.create!.mockReturnValue(svc);
      repo.save!.mockResolvedValue(svc);

      const dto = {
        name: 'Serviço de Pintura',
        description: 'Pintura residencial',
        price: '250.00',
        contact: '11999999999',
        category: 'Construção e Reformas',
        availableDays: ['seg', 'ter'],
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = await service.create(dto as any, provider);

      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledWith(svc);
      expect(messagingService.publish).toHaveBeenCalled();
      expect(result).toBe(svc);
    });

    it('deve lançar ForbiddenException se usuário não é prestador', async () => {
      const provider = { ...mockProvider(), isProvider: false };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await expect(service.create({} as any, provider as User)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve lançar ForbiddenException se sem condomínio', async () => {
      const provider = { ...mockProvider(), condominiumId: null };

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        service.create({ availableDays: ['seg'] } as any, provider as User),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar ForbiddenException se sem dias disponíveis', async () => {
      const provider = mockProvider();

      await expect(
        service.create(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          { condominiumId: 'condo-uuid', availableDays: [] } as any,
          provider,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('deve retornar o serviço com relations', async () => {
      const svc = mockService();
      repo.findOne!.mockResolvedValue(svc);

      const result = await service.findOne(svc.id);
      expect(result).toBe(svc);
    });

    it('deve lançar NotFoundException quando não encontrado', async () => {
      repo.findOne!.mockResolvedValue(null);

      await expect(service.findOne('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('deve atualizar o serviço quando é o dono', async () => {
      const svc = mockService();
      repo.findOne!.mockResolvedValue(svc);
      repo.save!.mockImplementation((s: Service) => s);

      const result = await service.update(
        svc.id,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        { name: 'Novo Nome' } as any,
        'provider-uuid',
      );

      expect(result.name).toBe('Novo Nome');
    });

    it('deve lançar ForbiddenException se não é o dono', async () => {
      const svc = mockService();
      repo.findOne!.mockResolvedValue(svc);

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        service.update(svc.id, {} as any, 'outro-user-id'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('deve fazer soft delete quando é o dono', async () => {
      const svc = mockService();
      repo.findOne!.mockResolvedValue(svc);
      repo.save!.mockImplementation((s: Service) => s);

      await service.remove(svc.id, 'provider-uuid');

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    it('deve lançar ForbiddenException se não é o dono', async () => {
      const svc = mockService();
      repo.findOne!.mockResolvedValue(svc);

      await expect(service.remove(svc.id, 'outro-user-id')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('trackMetric', () => {
    it('deve incrementar clicks do serviço', async () => {
      const svc = { ...mockService(), clicks: 5 };
      repo.findOne!.mockResolvedValue(svc);
      repo.save!.mockImplementation((s: Service) => s);

      await service.trackMetric(svc.id, 'clicks');

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ clicks: 6 }),
      );
    });

    it('deve lançar NotFoundException quando serviço não existe', async () => {
      repo.findOne!.mockResolvedValue(null);

      await expect(
        service.trackMetric('inexistente', 'clicks'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAnalytics', () => {
    it('deve retornar analytics para o dono do serviço', async () => {
      const svc = { ...mockService(), reviews: [] };
      repo.findOne!.mockResolvedValue(svc);

      const result = await service.getAnalytics(svc.id, 'provider-uuid');

      expect(result).toMatchObject({
        serviceId: svc.id,
        serviceName: svc.name,
        clicks: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      });
    });

    it('deve lançar ForbiddenException para quem não é o dono', async () => {
      const svc = mockService();
      repo.findOne!.mockResolvedValue(svc);

      await expect(
        service.getAnalytics(svc.id, 'outro-user-id'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

/**
 * Fronteira do condomínio — feature integridade-do-mural.
 * O mural é do prédio: morador do condomínio A não lê nem escreve nada do B.
 */
describe('ServicesService — fronteira do condomínio', () => {
  let service: ServicesService;
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const CONDO_A = 'condo-aaaa-0001';
  const CONDO_B = 'condo-bbbb-0002';

  const moradorDoA = (extra: Partial<User> = {}): User =>
    ({
      id: 'user-do-a',
      condominiumId: CONDO_A,
      isProvider: true,
      ...extra,
    }) as unknown as User;

  const servicoDoB = (): Service =>
    ({
      id: 'service-do-b',
      name: 'Faxina',
      condominiumId: CONDO_B,
      providerId: 'outro-prestador',
      isActive: true,
    }) as unknown as Service;

  beforeEach(async () => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((dto: unknown) => dto as Service),
      save: jest.fn((s: unknown) => Promise.resolve(s as Service)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        { provide: getRepositoryToken(Service), useValue: repo },
        { provide: MessagingService, useValue: { publish: jest.fn() } },
      ],
    }).compile();

    service = module.get<ServicesService>(ServicesService);
  });

  it('recusa listar serviços de outro condomínio @spec:AC-010', async () => {
    await expect(
      service.findByCondominiumForUser(moradorDoA(), CONDO_B),
    ).rejects.toThrow(ForbiddenException);

    // e não chegou a consultar o banco
    expect(repo.find).not.toHaveBeenCalled();
  });

  it('lista o próprio condomínio quando nenhum é informado @spec:AC-010', async () => {
    await service.findByCondominiumForUser(moradorDoA());

    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { condominiumId: CONDO_A, isActive: true },
      }),
    );
  });

  it('recusa abrir um serviço de outro condomínio @spec:AC-011', async () => {
    repo.findOne.mockResolvedValue(servicoDoB());

    await expect(
      service.findOneForUser('service-do-b', moradorDoA()),
    ).rejects.toThrow(ForbiddenException);
  });

  it('permite abrir um serviço do próprio condomínio @spec:AC-011', async () => {
    repo.findOne.mockResolvedValue({
      ...servicoDoB(),
      condominiumId: CONDO_A,
    } as unknown as Service);

    const encontrado = await service.findOneForUser(
      'service-do-a',
      moradorDoA(),
    );

    expect(encontrado.condominiumId).toBe(CONDO_A);
  });

  it('recusa publicar serviço em condomínio alheio @spec:AC-012', async () => {
    await expect(
      service.create(
        {
          name: 'Faxina',
          condominiumId: CONDO_B,
          availableDays: ['segunda'],
        } as never,
        moradorDoA(),
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('publica no próprio condomínio ignorando ausência do campo @spec:AC-012', async () => {
    const criado = await service.create(
      { name: 'Faxina', availableDays: ['segunda'] } as never,
      moradorDoA(),
    );

    expect(criado.condominiumId).toBe(CONDO_A);
  });

  it('nega quando o usuário não tem condomínio @spec:AC-010', async () => {
    await expect(
      service.findByCondominiumForUser(moradorDoA({ condominiumId: null })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('nega quando o serviço não tem condomínio @spec:AC-011', async () => {
    repo.findOne.mockResolvedValue({
      ...servicoDoB(),
      condominiumId: null,
    } as unknown as Service);

    await expect(
      service.findOneForUser('service-sem-condo', moradorDoA()),
    ).rejects.toThrow(ForbiddenException);
  });
});
