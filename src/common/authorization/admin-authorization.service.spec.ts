import { ForbiddenException } from '@nestjs/common';
import { AdminAuthorizationService } from './admin-authorization.service';
import { User } from '../../users/entities/user.entity';

/**
 * Feature papel-de-administrador.
 *
 * Antes disto o CRUD de condomínio exigia apenas estar autenticado: qualquer
 * morador renomeava ou desativava o condomínio de qualquer outro.
 */

const CONDO_A = 'condo-aaaa-0001';
const CONDO_B = 'condo-bbbb-0002';

const usuario = (extra: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    condominiumId: CONDO_A,
    isPlatformAdmin: false,
    isCondoManager: false,
    ...extra,
  }) as unknown as User;

describe('AdminAuthorizationService', () => {
  let service: AdminAuthorizationService;

  beforeEach(() => {
    service = new AdminAuthorizationService();
  });

  describe('morador comum', () => {
    it('não administra o próprio condomínio @spec:AC-021', () => {
      expect(service.podeAdministrarCondominio(usuario(), CONDO_A)).toBe(false);
    });

    it('recebe recusa explicando quem pode @spec:AC-021', () => {
      expect(() =>
        service.assertPodeAdministrarCondominio(usuario(), CONDO_A),
      ).toThrow(ForbiddenException);
    });
  });

  describe('síndico', () => {
    it('administra o próprio condomínio @spec:AC-022', () => {
      const sindico = usuario({ isCondoManager: true });

      expect(service.podeAdministrarCondominio(sindico, CONDO_A)).toBe(true);
      expect(() =>
        service.assertPodeAdministrarCondominio(sindico, CONDO_A),
      ).not.toThrow();
    });

    it('não administra condomínio alheio @spec:AC-023', () => {
      const sindico = usuario({ isCondoManager: true });

      expect(service.podeAdministrarCondominio(sindico, CONDO_B)).toBe(false);
      expect(() =>
        service.assertPodeAdministrarCondominio(sindico, CONDO_B),
      ).toThrow(ForbiddenException);
    });

    it('sem vínculo com condomínio é negado @spec:AC-023', () => {
      const semVinculo = usuario({ isCondoManager: true, condominiumId: null });

      expect(service.podeAdministrarCondominio(semVinculo, CONDO_A)).toBe(
        false,
      );
    });
  });

  describe('administrador da plataforma', () => {
    it('administra qualquer condomínio @spec:AC-024', () => {
      const admin = usuario({ isPlatformAdmin: true });

      expect(service.podeAdministrarCondominio(admin, CONDO_A)).toBe(true);
      expect(service.podeAdministrarCondominio(admin, CONDO_B)).toBe(true);
    });

    it('passa mesmo sem estar vinculado a condomínio nenhum @spec:AC-024', () => {
      const admin = usuario({ isPlatformAdmin: true, condominiumId: null });

      expect(service.podeAdministrarCondominio(admin, CONDO_B)).toBe(true);
    });
  });

  describe('ausência de dado nega', () => {
    it('usuário nulo é negado @spec:AC-021', () => {
      expect(service.podeAdministrarCondominio(null, CONDO_A)).toBe(false);
    });

    it('condomínio nulo é negado para síndico @spec:AC-023', () => {
      const sindico = usuario({ isCondoManager: true });

      expect(service.podeAdministrarCondominio(sindico, null)).toBe(false);
    });
  });
});
