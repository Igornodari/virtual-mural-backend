// Stripe é instanciado no construtor — mockamos antes de qualquer import
jest.mock('stripe', () => {
  const mockAccounts = {
    create: jest.fn(),
    retrieve: jest.fn(),
    createLoginLink: jest.fn(),
  };
  const mockAccountLinks = {
    create: jest.fn(),
  };

  const MockStripe = jest.fn().mockImplementation(() => ({
    accounts: mockAccounts,
    accountLinks: mockAccountLinks,
  }));

  (MockStripe as unknown as Record<string, unknown>).__mockAccounts = mockAccounts;
  (MockStripe as unknown as Record<string, unknown>).__mockAccountLinks =
    mockAccountLinks;

  return MockStripe;
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import { StripeConnectService } from './stripe-connect.service';
import { User } from '../users/entities/user.entity';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeProvider = (overrides: Partial<User> = {}): User =>
  ({
    id: 'provider-uuid',
    email: 'provider@example.com',
    stripeAccountId: null,
    stripeAccountStatus: null,
    ...overrides,
  }) as unknown as User;

const makeStripeAccount = (
  overrides: Partial<{
    id: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    requirements: { disabled_reason: string | null };
  }> = {},
) => ({
  id: 'acct_test_123',
  charges_enabled: false,
  payouts_enabled: false,
  requirements: { disabled_reason: null },
  ...overrides,
});

describe('StripeConnectService', () => {
  let service: StripeConnectService;
  let usersRepo: { findOne: jest.Mock; save: jest.Mock };
  let mockAccounts: Record<string, jest.Mock>;
  let mockAccountLinks: Record<string, jest.Mock>;

  beforeEach(async () => {
    usersRepo = { findOne: jest.fn(), save: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeConnectService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, fallback?: string) => {
              const map: Record<string, string> = {
                STRIPE_SECRET_KEY: 'sk_test_abc',
                PLATFORM_FEE_PERCENT: '5',
                STRIPE_CONNECT_RETURN_URL:
                  'http://localhost:4200/mural/provider?stripe_connect=success',
                STRIPE_CONNECT_REFRESH_URL:
                  'http://localhost:4200/mural/provider?stripe_connect=refresh',
              };
              return map[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<StripeConnectService>(StripeConnectService);

    // Acessa as referências dos mocks internos via propriedades estáticas do mock
    const StripeMock = Stripe as unknown as Record<string, unknown>;
    mockAccounts = StripeMock.__mockAccounts as Record<string, jest.Mock>;
    mockAccountLinks = StripeMock.__mockAccountLinks as Record<string, jest.Mock>;

    // Limpa implementações mas mantém a estrutura
    Object.values(mockAccounts).forEach((fn) => (fn as jest.Mock).mockReset());
    Object.values(mockAccountLinks).forEach((fn) => (fn as jest.Mock).mockReset());
  });

  afterEach(() => jest.clearAllMocks());

  // ── createOrGetAccount ──────────────────────────────────────────────────────

  describe('createOrGetAccount', () => {
    it('deve criar uma nova conta Stripe Express e retornar accountId e onboardingUrl', async () => {
      const provider = makeProvider({ stripeAccountId: null });
      usersRepo.findOne.mockResolvedValue(provider);
      usersRepo.save.mockResolvedValue(provider);

      mockAccounts.create.mockResolvedValue({ id: 'acct_new_123' });
      mockAccountLinks.create.mockResolvedValue({
        url: 'https://connect.stripe.com/onboard/acct_new_123',
      });

      const result = await service.createOrGetAccount('provider-uuid');

      expect(mockAccounts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'express',
          country: 'BR',
          email: provider.email,
        }),
      );
      expect(usersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ stripeAccountId: 'acct_new_123' }),
      );
      expect(result).toEqual({
        accountId: 'acct_new_123',
        onboardingUrl: 'https://connect.stripe.com/onboard/acct_new_123',
      });
    });

    it('deve reutilizar conta existente sem criar nova', async () => {
      const provider = makeProvider({ stripeAccountId: 'acct_existing' });
      usersRepo.findOne.mockResolvedValue(provider);
      mockAccountLinks.create.mockResolvedValue({
        url: 'https://connect.stripe.com/onboard/acct_existing',
      });

      const result = await service.createOrGetAccount('provider-uuid');

      expect(mockAccounts.create).not.toHaveBeenCalled();
      expect(result.accountId).toBe('acct_existing');
    });

    it('deve lançar NotFoundException se o provider não existir', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createOrGetAccount('inexistente'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── createOnboardingLink ────────────────────────────────────────────────────

  describe('createOnboardingLink', () => {
    it('deve retornar onboardingUrl para conta existente', async () => {
      const provider = makeProvider({ stripeAccountId: 'acct_existing' });
      usersRepo.findOne.mockResolvedValue(provider);
      mockAccountLinks.create.mockResolvedValue({
        url: 'https://connect.stripe.com/onboard/acct_existing',
      });

      const result = await service.createOnboardingLink('provider-uuid');

      expect(result).toEqual({
        onboardingUrl: 'https://connect.stripe.com/onboard/acct_existing',
      });
    });

    it('deve lançar BadRequestException se não existe conta Stripe ainda', async () => {
      const provider = makeProvider({ stripeAccountId: null });
      usersRepo.findOne.mockResolvedValue(provider);

      await expect(
        service.createOnboardingLink('provider-uuid'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── getStatus ───────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('deve retornar status null quando não há conta cadastrada', async () => {
      const provider = makeProvider({ stripeAccountId: null });
      usersRepo.findOne.mockResolvedValue(provider);

      const result = await service.getStatus('provider-uuid');

      expect(result).toEqual({
        accountId: null,
        status: null,
        chargesEnabled: false,
        payoutsEnabled: false,
      });
      expect(mockAccounts.retrieve).not.toHaveBeenCalled();
    });

    it('deve retornar status "active" quando charges e payouts estão habilitados', async () => {
      const provider = makeProvider({
        stripeAccountId: 'acct_active',
        stripeAccountStatus: 'pending' as never,
      });
      usersRepo.findOne.mockResolvedValue(provider);
      usersRepo.save.mockResolvedValue(provider);

      mockAccounts.retrieve.mockResolvedValue(
        makeStripeAccount({ charges_enabled: true, payouts_enabled: true }),
      );

      const result = await service.getStatus('provider-uuid');

      expect(result.status).toBe('active');
      expect(result.chargesEnabled).toBe(true);
      // Deve salvar a atualização de status no banco
      expect(usersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ stripeAccountStatus: 'active' }),
      );
    });

    it('deve retornar status "restricted" quando há disabled_reason', async () => {
      const provider = makeProvider({
        stripeAccountId: 'acct_restricted',
        stripeAccountStatus: 'pending' as never,
      });
      usersRepo.findOne.mockResolvedValue(provider);
      usersRepo.save.mockResolvedValue(provider);

      mockAccounts.retrieve.mockResolvedValue(
        makeStripeAccount({
          charges_enabled: false,
          payouts_enabled: false,
          requirements: { disabled_reason: 'requirements.past_due' },
        }),
      );

      const result = await service.getStatus('provider-uuid');

      expect(result.status).toBe('restricted');
    });

    it('deve retornar status "pending" quando não há disabled_reason e não está ativo', async () => {
      const provider = makeProvider({
        stripeAccountId: 'acct_pending',
        stripeAccountStatus: 'pending' as never,
      });
      usersRepo.findOne.mockResolvedValue(provider);
      usersRepo.save.mockResolvedValue(provider);

      mockAccounts.retrieve.mockResolvedValue(
        makeStripeAccount({
          charges_enabled: false,
          payouts_enabled: false,
          requirements: { disabled_reason: null },
        }),
      );

      const result = await service.getStatus('provider-uuid');

      expect(result.status).toBe('pending');
    });

    it('não deve salvar se o status não mudou', async () => {
      const provider = makeProvider({
        stripeAccountId: 'acct_active',
        stripeAccountStatus: 'active' as never,
      });
      usersRepo.findOne.mockResolvedValue(provider);

      mockAccounts.retrieve.mockResolvedValue(
        makeStripeAccount({ charges_enabled: true, payouts_enabled: true }),
      );

      await service.getStatus('provider-uuid');

      expect(usersRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── createDashboardLink ─────────────────────────────────────────────────────

  describe('createDashboardLink', () => {
    it('deve retornar URL do dashboard Stripe', async () => {
      const provider = makeProvider({ stripeAccountId: 'acct_dashboard' });
      usersRepo.findOne.mockResolvedValue(provider);

      mockAccounts.createLoginLink.mockResolvedValue({
        url: 'https://dashboard.stripe.com/express/acct_dashboard',
      });

      const result = await service.createDashboardLink('provider-uuid');

      expect(mockAccounts.createLoginLink).toHaveBeenCalledWith('acct_dashboard');
      expect(result).toEqual({
        url: 'https://dashboard.stripe.com/express/acct_dashboard',
      });
    });

    it('deve lançar BadRequestException se não existe conta Stripe', async () => {
      const provider = makeProvider({ stripeAccountId: null });
      usersRepo.findOne.mockResolvedValue(provider);

      await expect(
        service.createDashboardLink('provider-uuid'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── handleAccountUpdated ────────────────────────────────────────────────────

  describe('handleAccountUpdated', () => {
    it('deve atualizar o status do provider para "active" via webhook', async () => {
      const provider = makeProvider({
        stripeAccountId: 'acct_test_123',
        stripeAccountStatus: 'pending' as never,
      });
      usersRepo.findOne.mockResolvedValue(provider);
      usersRepo.save.mockResolvedValue(provider);

      mockAccounts.retrieve.mockResolvedValue(
        makeStripeAccount({ charges_enabled: true, payouts_enabled: true }),
      );

      await service.handleAccountUpdated('acct_test_123');

      expect(usersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ stripeAccountStatus: 'active' }),
      );
    });

    it('deve sair silenciosamente se o provider não for encontrado', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      mockAccounts.retrieve.mockResolvedValue(makeStripeAccount());

      await expect(
        service.handleAccountUpdated('acct_sem_provider'),
      ).resolves.not.toThrow();

      expect(usersRepo.save).not.toHaveBeenCalled();
    });

    it('não deve salvar se o status não mudou via webhook', async () => {
      const provider = makeProvider({
        stripeAccountId: 'acct_test_123',
        stripeAccountStatus: 'active' as never,
      });
      usersRepo.findOne.mockResolvedValue(provider);
      mockAccounts.retrieve.mockResolvedValue(
        makeStripeAccount({ charges_enabled: true, payouts_enabled: true }),
      );

      await service.handleAccountUpdated('acct_test_123');

      expect(usersRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── calculatePlatformFee ────────────────────────────────────────────────────

  describe('calculatePlatformFee', () => {
    it('deve calcular 5% de taxa sobre o valor em centavos', () => {
      expect(service.calculatePlatformFee(10000)).toBe(500); // R$100 → R$5
      expect(service.calculatePlatformFee(1000)).toBe(50); // R$10 → R$0.50
    });

    it('deve arredondar para o centavo mais próximo', () => {
      expect(service.calculatePlatformFee(333)).toBe(17); // 333 * 0.05 = 16.65 → 17
    });
  });
});
