/**
 * Testes do UsersService. Cobre o fluxo de updateOnboarding sob o
 * novo modelo de papéis (sem `roleInCondominium`/`roleCompleted`).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';

import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Service } from '../services/entities/service.entity';
import { Appointment } from '../appointments/entities/appointment.entity';

function makeUserEntity(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    cognitoSub: 'sub-1',
    email: 'u@example.com',
    givenName: '',
    familyName: '',
    displayName: '',
    phone: '',
    avatarUrl: '',
    cognitoUsername: 'u',
    authProvider: 'cognito',
    isProvider: false,
    onboardingCompleted: false,
    addressCompleted: false,
    condominium: null,
    condominiumId: null,
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

describe('UsersService', () => {
  let service: UsersService;
  let repo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };
  let servicesRepo: { count: jest.Mock };
  let appointmentsRepo: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation(async (data) => data),
      find: jest.fn().mockResolvedValue([]),
    };
    servicesRepo = { count: jest.fn().mockResolvedValue(0) };
    appointmentsRepo = {
      createQueryBuilder: jest.fn(() => ({
        innerJoin: () => ({
          where: () => ({
            andWhere: () => ({ getCount: async () => 0 }),
          }),
        }),
      })),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: getRepositoryToken(Service), useValue: servicesRepo },
        { provide: getRepositoryToken(Appointment), useValue: appointmentsRepo },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  // ── findOrCreateByCognito ────────────────────────────────────────────────

  describe('findOrCreateByCognito', () => {
    it('cria o perfil quando o cognitoSub não existe', async () => {
      repo.findOne.mockResolvedValue(null);
      await service.findOrCreateByCognito({
        cognitoSub: 'sub-new',
        email: 'new@example.com',
        givenName: 'New',
      });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ cognitoSub: 'sub-new', email: 'new@example.com' }),
      );
      expect(repo.save).toHaveBeenCalled();
    });

    it('reusa o perfil existente quando o cognitoSub já está cadastrado', async () => {
      const existing = makeUserEntity({ cognitoSub: 'sub-existing' });
      repo.findOne.mockResolvedValue(existing);

      const result = await service.findOrCreateByCognito({
        cognitoSub: 'sub-existing',
        email: 'existing@example.com',
      });

      expect(repo.create).not.toHaveBeenCalled();
      expect(result.id).toBe('u-1');
    });

    it('atualiza lastLoginAt ao reutilizar o perfil', async () => {
      const existing = makeUserEntity({
        cognitoSub: 'sub-existing',
        lastLoginAt: new Date('2020-01-01'),
      });
      repo.findOne.mockResolvedValue(existing);

      await service.findOrCreateByCognito({
        cognitoSub: 'sub-existing',
        email: 'e@e.com',
      });

      // O save é chamado com lastLoginAt atualizado
      const savedArg = repo.save.mock.calls[0][0];
      expect(savedArg.lastLoginAt.getTime()).toBeGreaterThan(
        new Date('2020-01-02').getTime(),
      );
    });

    it('detecta authProvider Google quando o username começa com "Google"', async () => {
      repo.findOne.mockResolvedValue(null);
      await service.findOrCreateByCognito({
        cognitoSub: 'sub-google',
        email: 'g@example.com',
        cognitoUsername: 'Google_12345',
      });

      const created = repo.create.mock.calls[0][0];
      expect(created.authProvider).toBe('google');
    });
  });

  // ── findById ────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('lança NotFound quando o usuário não existe', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findById('does-not-exist')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('retorna o usuário existente', async () => {
      repo.findOne.mockResolvedValue(makeUserEntity({ id: 'real-id' }));
      const result = await service.findById('real-id');
      expect(result.id).toBe('real-id');
    });
  });

  // ── updateOnboarding ────────────────────────────────────────────────────

  describe('updateOnboarding', () => {
    it('atualiza condominiumId e marca addressCompleted=true', async () => {
      repo.findOne.mockResolvedValue(makeUserEntity({ condominiumId: null }));
      const result = await service.updateOnboarding('u-1', {
        condominiumId: 'condo-1',
      });
      expect(result.condominiumId).toBe('condo-1');
      expect(result.addressCompleted).toBe(true);
    });

    it('atualiza isProvider quando fornecido', async () => {
      repo.findOne.mockResolvedValue(makeUserEntity({ isProvider: false }));
      const result = await service.updateOnboarding('u-1', { isProvider: true });
      expect(result.isProvider).toBe(true);
    });

    it('permite desativar isProvider (false explícito)', async () => {
      repo.findOne.mockResolvedValue(
        makeUserEntity({ isProvider: true, addressCompleted: true }),
      );
      const result = await service.updateOnboarding('u-1', { isProvider: false });
      expect(result.isProvider).toBe(false);
    });

    it('não altera campos quando o DTO está vazio (idempotente)', async () => {
      const user = makeUserEntity({
        isProvider: true,
        condominiumId: 'c-1',
        addressCompleted: true,
      });
      repo.findOne.mockResolvedValue(user);
      const result = await service.updateOnboarding('u-1', {});
      expect(result.isProvider).toBe(true);
      expect(result.condominiumId).toBe('c-1');
    });

    it('onboardingCompleted é true após o endereço estar setado, independente do prestador', async () => {
      repo.findOne.mockResolvedValue(
        makeUserEntity({ addressCompleted: false }),
      );
      const result = await service.updateOnboarding('u-1', {
        condominiumId: 'c-1',
      });
      // Esse é o invariante novo: ser prestador NÃO é requisito para
      // considerar o onboarding concluído.
      expect(result.onboardingCompleted).toBe(true);
      expect(result.isProvider).toBe(false);
    });

    it('atualizar isProvider sozinho não muda addressCompleted', async () => {
      repo.findOne.mockResolvedValue(
        makeUserEntity({ addressCompleted: false }),
      );
      const result = await service.updateOnboarding('u-1', { isProvider: true });
      expect(result.addressCompleted).toBe(false);
      expect(result.onboardingCompleted).toBe(false);
    });
  });

  // ── Guard de desativação do modo prestador ──────────────────────────────

  describe('assertCanDeactivateProvider', () => {
    it('passa quando o usuário não tem serviços ativos nem agendamentos abertos', async () => {
      servicesRepo.count.mockResolvedValue(0);
      appointmentsRepo.createQueryBuilder.mockReturnValue({
        innerJoin: () => ({
          where: () => ({
            andWhere: () => ({ getCount: async () => 0 }),
          }),
        }),
      });

      await expect(
        service.assertCanDeactivateProvider('u-1'),
      ).resolves.toBeUndefined();
    });

    it('bloqueia desativação quando há serviço ativo', async () => {
      servicesRepo.count.mockResolvedValue(2);

      await expect(
        service.assertCanDeactivateProvider('u-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('bloqueia desativação quando há agendamento aberto mesmo sem serviços ativos', async () => {
      servicesRepo.count.mockResolvedValue(0);
      appointmentsRepo.createQueryBuilder.mockReturnValue({
        innerJoin: () => ({
          where: () => ({
            andWhere: () => ({ getCount: async () => 1 }),
          }),
        }),
      });

      await expect(
        service.assertCanDeactivateProvider('u-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('updateOnboarding({isProvider:false}) chama o guard quando o usuário ERA prestador', async () => {
      const user = makeUserEntity({ isProvider: true, addressCompleted: true });
      repo.findOne.mockResolvedValue(user);
      servicesRepo.count.mockResolvedValue(1);

      await expect(
        service.updateOnboarding('u-1', { isProvider: false }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('updateOnboarding({isProvider:true}) NÃO chama o guard', async () => {
      const user = makeUserEntity({ isProvider: false });
      repo.findOne.mockResolvedValue(user);

      await service.updateOnboarding('u-1', { isProvider: true });

      expect(servicesRepo.count).not.toHaveBeenCalled();
    });
  });
});
