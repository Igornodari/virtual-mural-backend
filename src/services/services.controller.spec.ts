import { Test, TestingModule } from '@nestjs/testing';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Service } from './entities/service.entity';
import { User } from '../users/entities/user.entity';

const mockUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-uuid-1',
    email: 'provider@example.com',
    isProvider: true,
    condominiumId: 'cond-uuid-1',
    ...overrides,
  }) as unknown as User;

const mockService = (overrides: Partial<Service> = {}): Service =>
  ({
    id: 'service-uuid-1',
    name: 'Pintura',
    category: 'MAINTENANCE',
    isActive: true,
    providerId: 'user-uuid-1',
    condominiumId: 'cond-uuid-1',
    ...overrides,
  }) as unknown as Service;

describe('ServicesController', () => {
  let controller: ServicesController;
  let servicesService: jest.Mocked<ServicesService>;

  beforeEach(async () => {
    const mockServicesService: Partial<jest.Mocked<ServicesService>> = {
      create: jest.fn(),
      findByCondominium: jest.fn(),
      findByProvider: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      trackMetric: jest.fn(),
      getProviderAnalytics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServicesController],
      providers: [{ provide: ServicesService, useValue: mockServicesService }],
    }).compile();

    controller = module.get<ServicesController>(ServicesController);
    servicesService = module.get(ServicesService);
  });

  // ── POST /services ────────────────────────────────────────────────────────

  describe('create', () => {
    it('deve delegar a criação ao ServicesService com dto e usuário', async () => {
      const user = mockUser();
      const dto: CreateServiceDto = {
        name: 'Pintura',
        category: 'MAINTENANCE',
      } as CreateServiceDto;
      const service = mockService();

      servicesService.create.mockResolvedValue(service);

      const result = await controller.create(dto, user);

      expect(servicesService.create).toHaveBeenCalledWith(dto, user);
      expect(result).toEqual(service);
    });
  });

  // ── GET /services ─────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve buscar pelo condomínio do usuário quando não há query params', async () => {
      const user = mockUser();
      const services = [mockService()];

      servicesService.findByCondominium.mockResolvedValue(services);

      const result = await controller.findAll(user);

      expect(servicesService.findByCondominium).toHaveBeenCalledWith('cond-uuid-1');
      expect(result).toEqual(services);
    });

    it('deve buscar por condominiumId quando informado via query', async () => {
      const user = mockUser();
      const services = [mockService()];

      servicesService.findByCondominium.mockResolvedValue(services);

      await controller.findAll(user, 'outro-cond-id');

      expect(servicesService.findByCondominium).toHaveBeenCalledWith('outro-cond-id');
    });

    it('deve buscar serviços do prestador quando mine=true', async () => {
      const user = mockUser();
      const services = [mockService()];

      servicesService.findByProvider.mockResolvedValue(services);

      const result = await controller.findAll(user, undefined, true);

      expect(servicesService.findByProvider).toHaveBeenCalledWith(user.id);
      expect(result).toEqual(services);
    });
  });

  // ── GET /services/analytics/me ────────────────────────────────────────────

  describe('getProviderAnalytics', () => {
    it('deve retornar analytics do prestador autenticado', async () => {
      const user = mockUser();
      const analytics = [{ serviceId: 'svc-1', clicks: 10 }] as any;

      servicesService.getProviderAnalytics.mockResolvedValue(analytics);

      const result = await controller.getProviderAnalytics(user);

      expect(servicesService.getProviderAnalytics).toHaveBeenCalledWith(user.id);
      expect(result).toEqual(analytics);
    });
  });

  // ── GET /services/:id ─────────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar o serviço pelo id', async () => {
      const service = mockService();

      servicesService.findOne.mockResolvedValue(service);

      const result = await controller.findOne(service.id);

      expect(servicesService.findOne).toHaveBeenCalledWith(service.id);
      expect(result).toEqual(service);
    });
  });

  // ── PATCH /services/:id ───────────────────────────────────────────────────

  describe('update', () => {
    it('deve delegar a atualização ao ServicesService', async () => {
      const user = mockUser();
      const service = mockService();
      const dto: UpdateServiceDto = { name: 'Pintura Residencial' };
      const updated = { ...service, ...dto } as Service;

      servicesService.update.mockResolvedValue(updated);

      const result = await controller.update(service.id, dto, user);

      expect(servicesService.update).toHaveBeenCalledWith(service.id, dto, user.id);
      expect(result).toEqual(updated);
    });
  });

  // ── DELETE /services/:id ──────────────────────────────────────────────────

  describe('remove', () => {
    it('deve chamar remove no ServicesService com id e userId', async () => {
      const user = mockUser();
      const service = mockService();

      servicesService.remove.mockResolvedValue(undefined);

      await controller.remove(service.id, user);

      expect(servicesService.remove).toHaveBeenCalledWith(service.id, user.id);
    });
  });

  // ── PATCH /services/:id/track/:metric ─────────────────────────────────────

  describe('trackMetric', () => {
    it.each(['clicks', 'interests', 'completions', 'abandonments'] as const)(
      'deve registrar a métrica "%s"',
      async (metric) => {
        const serviceId = 'service-uuid-1';

        servicesService.trackMetric.mockResolvedValue(undefined);

        await controller.trackMetric(serviceId, metric);

        expect(servicesService.trackMetric).toHaveBeenCalledWith(serviceId, metric);
      },
    );
  });
});
