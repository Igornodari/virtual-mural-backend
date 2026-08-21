import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AdminAuthorizationService } from '../common/authorization/admin-authorization.service';
import { User } from './entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';

const mockUser = (): User =>
  ({
    id: 'user-uuid-1',
    email: 'test@example.com',
    givenName: 'João',
    familyName: 'Silva',
    displayName: 'João Silva',
    isProvider: false,
    termsAcceptedAt: null,
  }) as unknown as User;

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(async () => {
    const mockUsersService: Partial<jest.Mocked<UsersService>> = {
      updateProfile: jest.fn(),
      updateOnboarding: jest.fn(),
      exportData: jest.fn(),
      deleteAccount: jest.fn(),
      acceptTerms: jest.fn(),
      findAllByCondominium: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        AdminAuthorizationService,
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get(UsersService);
  });

  // ── GET /users/me ─────────────────────────────────────────────────────────

  describe('getMe', () => {
    it('deve retornar o usuário autenticado diretamente', () => {
      const user = mockUser();
      expect(controller.getMe(user)).toEqual(user);
    });
  });

  // ── PATCH /users/me/profile ───────────────────────────────────────────────

  describe('updateProfile', () => {
    it('deve delegar a atualização ao UsersService', async () => {
      const user = mockUser();
      const dto: UpdateProfileDto = { givenName: 'Carlos' };
      const updated = { ...user, ...dto } as User;

      usersService.updateProfile.mockResolvedValue(updated);

      const result = await controller.updateProfile(user, dto);

      expect(usersService.updateProfile).toHaveBeenCalledWith(user.id, dto);
      expect(result).toEqual(updated);
    });
  });

  // ── PATCH /users/me/onboarding ────────────────────────────────────────────

  describe('updateOnboarding', () => {
    it('deve delegar o onboarding ao UsersService', async () => {
      const user = mockUser();
      const dto: UpdateOnboardingDto = { condominiumId: 'cond-uuid-1' };
      const updated = { ...user, condominiumId: 'cond-uuid-1' } as User;

      usersService.updateOnboarding.mockResolvedValue(updated);

      const result = await controller.updateOnboarding(user, dto);

      expect(usersService.updateOnboarding).toHaveBeenCalledWith(user.id, dto);
      expect(result).toEqual(updated);
    });
  });

  // ── GET /users/me/export ──────────────────────────────────────────────────

  describe('exportData', () => {
    it('deve delegar a exportação ao UsersService', async () => {
      const user = mockUser();
      const exportResult = {
        id: user.id,
        email: user.email,
        exportedAt: new Date().toISOString(),
        services: [],
        appointments: [],
        totalReviews: 0,
      } as any;

      usersService.exportData.mockResolvedValue(exportResult);

      const result = await controller.exportData(user);

      expect(usersService.exportData).toHaveBeenCalledWith(user.id);
      expect(result).toEqual(exportResult);
    });
  });

  // ── DELETE /users/me ──────────────────────────────────────────────────────

  describe('deleteAccount', () => {
    it('deve chamar deleteAccount no UsersService sem retornar conteúdo', async () => {
      const user = mockUser();
      usersService.deleteAccount.mockResolvedValue(undefined);

      await controller.deleteAccount(user);

      expect(usersService.deleteAccount).toHaveBeenCalledWith(user.id);
    });
  });

  // ── POST /users/me/accept-terms ───────────────────────────────────────────

  describe('acceptTerms', () => {
    it('deve chamar acceptTerms no UsersService com o id do usuário', async () => {
      const user = mockUser();
      const updated = { ...user, termsAcceptedAt: new Date() } as User;

      usersService.acceptTerms.mockResolvedValue(updated);

      const result = await controller.acceptTerms(user);

      expect(usersService.acceptTerms).toHaveBeenCalledWith(user.id);
      expect(result).toEqual(updated);
    });
  });

  // ── Listagem de moradores pelo síndico ────────────────────────────────────
  // feature papel-de-administrador

  describe('listarMoradores', () => {
    const CONDO_A = 'condo-aaaa-0001';
    const CONDO_B = 'condo-bbbb-0002';

    const pessoa = (extra: Partial<User> = {}): User =>
      ({
        id: 'user-1',
        condominiumId: CONDO_A,
        isPlatformAdmin: false,
        isCondoManager: false,
        ...extra,
      }) as unknown as User;

    const moradorDaBase = () =>
      ({
        id: 'morador-1',
        displayName: 'Maria',
        email: 'maria@example.com',
        isProvider: true,
        onboardingCompleted: true,
        createdAt: new Date('2026-01-01'),
        cognitoSub: 'sub-secreto',
        phone: '11999999999',
      }) as unknown as User;

    it('síndico lista os moradores do próprio condomínio @spec:AC-026', async () => {
      usersService.findAllByCondominium.mockResolvedValue([moradorDaBase()]);

      const lista = await controller.listarMoradores(
        CONDO_A,
        pessoa({ isCondoManager: true }),
      );

      expect(lista).toHaveLength(1);
      expect(lista[0]).toMatchObject({ id: 'morador-1', displayName: 'Maria' });
    });

    it('devolve só o necessário, sem o registro completo @spec:AC-026', async () => {
      usersService.findAllByCondominium.mockResolvedValue([moradorDaBase()]);

      const lista = await controller.listarMoradores(
        CONDO_A,
        pessoa({ isCondoManager: true }),
      );

      // acesso amplo a dado pessoal precisa de justificativa de finalidade
      expect(lista[0]).not.toHaveProperty('cognitoSub');
      expect(lista[0]).not.toHaveProperty('phone');
    });

    it('síndico não lista moradores de outro condomínio @spec:AC-027', async () => {
      await expect(
        controller.listarMoradores(CONDO_B, pessoa({ isCondoManager: true })),
      ).rejects.toThrow(ForbiddenException);

      expect(usersService.findAllByCondominium).not.toHaveBeenCalled();
    });

    it('morador comum não lista moradores @spec:AC-027', async () => {
      await expect(
        controller.listarMoradores(CONDO_A, pessoa()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('administrador da plataforma lista qualquer condomínio @spec:AC-026', async () => {
      usersService.findAllByCondominium.mockResolvedValue([]);

      await controller.listarMoradores(
        CONDO_B,
        pessoa({ isPlatformAdmin: true, condominiumId: null }),
      );

      expect(usersService.findAllByCondominium).toHaveBeenCalledWith(CONDO_B);
    });
  });
});
