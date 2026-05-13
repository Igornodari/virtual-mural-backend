/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await --
   Specs e fakes de repositório usam `any` deliberadamente para simular a
   API do TypeORM sem precisar implementar todos os métodos. As checagens
   de segurança não se aplicam a mocks. */
/**
 * Testes do ServicesService — foco no novo gate `isProvider` e nas
 * regras de ACL para edição/remoção.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ServicesService } from './services.service';
import { Service } from './entities/service.entity';
import { User } from '../users/entities/user.entity';
import { MessagingService } from '../messaging/messaging.service';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    isProvider: true,
    condominiumId: 'condo-1',
    email: 'u@example.com',
    displayName: 'User',
    ...overrides,
  } as unknown as User;
}

function makeServiceEntity(overrides: Partial<Service> = {}): Service {
  return {
    id: 'svc-1',
    name: 'Test',
    providerId: 'u-1',
    condominiumId: 'condo-1',
    isActive: true,
    availableDays: ['monday'],
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

describe('ServicesService', () => {
  let service: ServicesService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let messaging: { publish: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation(async (data) => ({
        ...data,
        id: data.id ?? 'svc-new',
      })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    messaging = { publish: jest.fn().mockResolvedValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        { provide: getRepositoryToken(Service), useValue: repo },
        { provide: MessagingService, useValue: messaging },
      ],
    }).compile();

    service = moduleRef.get(ServicesService);
  });

  describe('create', () => {
    it('rejeita morador comum (isProvider=false)', async () => {
      const provider = makeUser({ isProvider: false });
      await expect(
        service.create(
          { name: 'X', availableDays: ['monday'] } as any,
          provider,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejeita prestador sem condomínio vinculado', async () => {
      const provider = makeUser({ isProvider: true, condominiumId: null });
      await expect(
        service.create(
          { name: 'X', availableDays: ['monday'] } as any,
          provider,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejeita criação sem ao menos um availableDay (nem via slots)', async () => {
      const provider = makeUser({ isProvider: true });
      await expect(
        service.create({ name: 'X', availableDays: [] } as any, provider),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cria serviço e dispara evento de mensageria', async () => {
      const provider = makeUser({ isProvider: true });
      const result = await service.create(
        {
          name: 'Corte',
          description: 'd',
          category: 'beauty',
          price: '50',
          contact: '99',
          availableDays: ['monday'],
        } as any,
        provider,
      );
      expect(result).toMatchObject({
        name: 'Corte',
        providerId: 'u-1',
        condominiumId: 'condo-1',
      });
      expect(messaging.publish).toHaveBeenCalledTimes(1);
    });

    it('deriva availableDays dos availabilitySlots quando fornecidos', async () => {
      const provider = makeUser({ isProvider: true });
      await service.create(
        {
          name: 'X',
          availabilitySlots: [
            { day: 'tuesday', startTime: '09:00', endTime: '12:00' },
          ],
        } as any,
        provider,
      );
      const created = repo.create.mock.calls[0][0];
      expect(created.availableDays).toEqual(['tuesday']);
    });
  });

  describe('update', () => {
    it('rejeita usuário que não é o dono do serviço', async () => {
      repo.findOne.mockResolvedValue(
        makeServiceEntity({ providerId: 'owner' }),
      );
      await expect(
        service.update('svc-1', { name: 'novo' } as any, 'invasor'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('aceita update vindo do dono', async () => {
      repo.findOne.mockResolvedValue(
        makeServiceEntity({ providerId: 'owner' }),
      );
      const result = await service.update(
        'svc-1',
        { name: 'novo nome' } as any,
        'owner',
      );
      expect(result.name).toBe('novo nome');
    });
  });

  describe('remove', () => {
    it('rejeita usuário que não é o dono', async () => {
      repo.findOne.mockResolvedValue(
        makeServiceEntity({ providerId: 'owner' }),
      );
      await expect(service.remove('svc-1', 'invasor')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('faz soft delete (isActive=false) quando vindo do dono', async () => {
      const svc = makeServiceEntity({ providerId: 'owner', isActive: true });
      repo.findOne.mockResolvedValue(svc);
      await service.remove('svc-1', 'owner');
      const saved = repo.save.mock.calls[0][0];
      expect(saved.isActive).toBe(false);
    });
  });

  describe('findOne', () => {
    it('lança NotFound se o serviço não existe', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getAnalytics', () => {
    it('rejeita acesso por quem não é o prestador', async () => {
      repo.findOne.mockResolvedValue(
        makeServiceEntity({ providerId: 'owner', reviews: [] } as any),
      );
      await expect(service.getAnalytics('svc-1', 'invasor')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('retorna distribuição de ratings consolidada para o dono', async () => {
      repo.findOne.mockResolvedValue(
        makeServiceEntity({
          providerId: 'owner',
          reviews: [
            { rating: 5, comment: 'top', createdAt: new Date() },
            { rating: 4, comment: '', createdAt: new Date() },
            { rating: 5, comment: 'show', createdAt: new Date() },
          ],
        } as any),
      );
      const result = await service.getAnalytics('svc-1', 'owner');
      expect(result.ratingDistribution).toEqual({
        1: 0,
        2: 0,
        3: 0,
        4: 1,
        5: 2,
      });
      expect(result.recentComments).toHaveLength(2); // só os com comment
    });
  });

  describe('trackMetric', () => {
    it('incrementa o contador da métrica', async () => {
      repo.findOne.mockResolvedValue(makeServiceEntity({ clicks: 7 }));
      await service.trackMetric('svc-1', 'clicks');
      const saved = repo.save.mock.calls[0][0];
      expect(saved.clicks).toBe(8);
    });

    it('rejeita serviço inexistente', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.trackMetric('missing', 'interests')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
