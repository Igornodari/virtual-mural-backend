import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Service } from '../services/entities/service.entity';
import { Appointment } from '../appointments/entities/appointment.entity';

const mockUser = (): User =>
  ({
    id: 'user-uuid-1',
    cognitoSub: 'cognito-sub-1',
    email: 'test@example.com',
    givenName: 'João',
    familyName: 'Silva',
    displayName: 'João Silva',
    phone: '+5511999999999',
    avatarUrl: 'https://example.com/avatar.jpg',
    cognitoUsername: 'joaosilva',
    authProvider: 'cognito',
    isProvider: false,
    onboardingCompleted: false,
    addressCompleted: false,
    condominiumId: null,
    condominium: null,
    services: [],
    appointments: [],
    reviews: [],
    stripeAccountId: null,
    stripeAccountStatus: null,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as User;

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const createMockRepo = <T>(): MockRepo<T> => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let usersRepo: MockRepo<User>;
  let servicesRepo: MockRepo<Service>;
  let appointmentsRepo: MockRepo<Appointment>;

  beforeEach(async () => {
    usersRepo = createMockRepo<User>();
    servicesRepo = createMockRepo<Service>();
    appointmentsRepo = createMockRepo<Appointment>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Service), useValue: servicesRepo },
        { provide: getRepositoryToken(Appointment), useValue: appointmentsRepo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── findOrCreateByCognito ────────────────────────────────────────────────

  describe('findOrCreateByCognito', () => {
    it('deve retornar o usuário existente e atualizar lastLoginAt', async () => {
      const user = mockUser();
      usersRepo.findOne!.mockResolvedValue(user);
      usersRepo.save!.mockResolvedValue(user);

      const result = await service.findOrCreateByCognito({
        cognitoSub: user.cognitoSub,
        email: user.email,
      });

      expect(usersRepo.findOne).toHaveBeenCalledWith({
        where: { cognitoSub: user.cognitoSub },
        relations: ['condominium'],
      });
      expect(result).toBe(user);
      expect(usersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ lastLoginAt: expect.any(Date) }),
      );
    });

    it('deve criar novo usuário quando não existe', async () => {
      const newUser = mockUser();
      usersRepo.findOne!.mockResolvedValue(null);
      usersRepo.create!.mockReturnValue(newUser);
      usersRepo.save!.mockResolvedValue(newUser);

      const result = await service.findOrCreateByCognito({
        cognitoSub: 'new-sub',
        email: 'new@example.com',
        givenName: 'Ana',
        familyName: 'Costa',
      });

      expect(usersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cognitoSub: 'new-sub',
          email: 'new@example.com',
          givenName: 'Ana',
          familyName: 'Costa',
          authProvider: 'cognito',
        }),
      );
      expect(result).toBe(newUser);
    });

    it('deve marcar authProvider como google quando username inclui Google', async () => {
      const newUser = mockUser();
      usersRepo.findOne!.mockResolvedValue(null);
      usersRepo.create!.mockReturnValue(newUser);
      usersRepo.save!.mockResolvedValue(newUser);

      await service.findOrCreateByCognito({
        cognitoSub: 'google-sub',
        email: 'google@example.com',
        cognitoUsername: 'Google_1234567890',
      });

      expect(usersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ authProvider: 'google' }),
      );
    });
  });

  // ── findById ─────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('deve retornar o usuário quando encontrado', async () => {
      const user = mockUser();
      usersRepo.findOne!.mockResolvedValue(user);

      const result = await service.findById(user.id);
      expect(result).toBe(user);
    });

    it('deve lançar NotFoundException quando usuário não existe', async () => {
      usersRepo.findOne!.mockResolvedValue(null);

      await expect(service.findById('id-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── updateProfile ─────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('deve atualizar givenName e phone do usuário', async () => {
      const user = mockUser();
      const updated = { ...user, givenName: 'Pedro', phone: '+5511888888888' };
      usersRepo.findOne!.mockResolvedValue(user);
      usersRepo.save!.mockResolvedValue(updated);

      const result = await service.updateProfile(user.id, {
        givenName: 'Pedro',
        phone: '+5511888888888',
      });

      expect(usersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ givenName: 'Pedro', phone: '+5511888888888' }),
      );
      expect(result.givenName).toBe('Pedro');
    });

    it('deve lançar NotFoundException quando usuário não existe', async () => {
      usersRepo.findOne!.mockResolvedValue(null);

      await expect(
        service.updateProfile('id-invalido', { givenName: 'Teste' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateOnboarding ──────────────────────────────────────────────────────

  describe('updateOnboarding', () => {
    it('deve vincular o usuário a um condomínio', async () => {
      const user = mockUser();
      usersRepo.findOne!.mockResolvedValue(user);
      usersRepo.save!.mockImplementation(async (u: User) => u);

      const result = await service.updateOnboarding(user.id, {
        condominiumId: 'condo-uuid',
      });

      expect(result.condominiumId).toBe('condo-uuid');
      expect(result.addressCompleted).toBe(true);
      expect(result.onboardingCompleted).toBe(true);
    });

    it('deve chamar assertCanDeactivateProvider ao desativar prestador', async () => {
      const user = { ...mockUser(), isProvider: true };
      usersRepo.findOne!.mockResolvedValue(user);
      usersRepo.save!.mockImplementation(async (u: User) => u);
      servicesRepo.count!.mockResolvedValue(0);

      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      } as unknown as SelectQueryBuilder<Appointment>;

      appointmentsRepo.createQueryBuilder!.mockReturnValue(mockQb);

      const result = await service.updateOnboarding(user.id, { isProvider: false });
      expect(result.isProvider).toBe(false);
    });
  });

  // ── assertCanDeactivateProvider ───────────────────────────────────────────

  describe('assertCanDeactivateProvider', () => {
    it('deve lançar BadRequestException se há serviços ativos', async () => {
      servicesRepo.count!.mockResolvedValue(2);

      await expect(service.assertCanDeactivateProvider('user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(servicesRepo.count).toHaveBeenCalledWith({
        where: { providerId: 'user-1', isActive: true },
      });
    });

    it('deve lançar BadRequestException se há agendamentos abertos', async () => {
      servicesRepo.count!.mockResolvedValue(0);

      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(3),
      } as unknown as SelectQueryBuilder<Appointment>;

      appointmentsRepo.createQueryBuilder!.mockReturnValue(mockQb);

      await expect(service.assertCanDeactivateProvider('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve completar sem erro quando não há impeditivos', async () => {
      servicesRepo.count!.mockResolvedValue(0);

      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      } as unknown as SelectQueryBuilder<Appointment>;

      appointmentsRepo.createQueryBuilder!.mockReturnValue(mockQb);

      await expect(service.assertCanDeactivateProvider('user-1')).resolves.toBeUndefined();
    });
  });

  // ── deleteAccount (LGPD) ──────────────────────────────────────────────────

  describe('deleteAccount', () => {
    it('deve anonimizar os dados do usuário', async () => {
      const user = mockUser();
      usersRepo.findOne!.mockResolvedValue(user);
      usersRepo.save!.mockImplementation(async (u: User) => u);

      await service.deleteAccount(user.id);

      expect(usersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: expect.stringContaining('deleted_'),
          givenName: 'Usuário',
          familyName: 'Removido',
          phone: null,
          avatarUrl: null,
          isProvider: false,
        }),
      );
    });

    it('deve bloquear se usuário prestador tem serviços ativos', async () => {
      const user = { ...mockUser(), isProvider: true };
      usersRepo.findOne!.mockResolvedValue(user);
      servicesRepo.count!.mockResolvedValue(1);

      await expect(service.deleteAccount(user.id)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── exportData (LGPD) ─────────────────────────────────────────────────────

  describe('exportData', () => {
    it('deve retornar dados pessoais completos do usuário', async () => {
      const user = { ...mockUser(), services: [], appointments: [], reviews: [] };
      usersRepo.findOne!.mockResolvedValue(user);

      const result = await service.exportData(user.id);

      expect(result).toMatchObject({
        id: user.id,
        email: user.email,
        exportedAt: expect.any(String),
        services: [],
        appointments: [],
      });
    });

    it('deve lançar NotFoundException quando usuário não existe', async () => {
      usersRepo.findOne!.mockResolvedValue(null);

      await expect(service.exportData('id-invalido')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
