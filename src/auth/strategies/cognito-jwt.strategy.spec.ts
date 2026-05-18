// ── Mocks devem vir ANTES de qualquer import — Jest os hoi sta automaticamente ──
// jwks-rsa importa 'jose' que é ESM puro (não suportado pelo Jest/CommonJS)
jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest
    .fn()
    .mockReturnValue(
      (
        _req: unknown,
        _token: unknown,
        done: (err: null, secret: string) => void,
      ) => done(null, 'mocked-secret'),
    ),
}));

// @nestjs/passport instancia o Passport internamente; mockamos para evitar a
// inicialização real da estratégia JWT (que requer a chave JWKS online)
jest.mock('@nestjs/passport', () => ({
  PassportStrategy: (_Strategy: unknown) =>
    class MockPassportBase {
      constructor(..._args: unknown[]) {}
    },
}));

// passport-jwt também precisa ser mockado para evitar importação do 'jose'
jest.mock('passport-jwt', () => ({
  Strategy: class MockStrategy {},
  ExtractJwt: {
    fromAuthHeaderAsBearerToken: jest.fn().mockReturnValue(jest.fn()),
  },
}));

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CognitoJwtStrategy, CognitoJwtPayload } from './cognito-jwt.strategy';
import { UsersService } from '../../users/users.service';

const mockConfig = {
  getOrThrow: jest.fn((key: string) => {
    const map: Record<string, string> = {
      AWS_REGION: 'sa-east-1',
      COGNITO_USER_POOL_ID: 'sa-east-1_TestPool',
      COGNITO_CLIENT_ID: 'test-client-id',
    };
    return map[key] ?? '';
  }),
};

const mockUsersService = {
  findOrCreateByCognito: jest.fn(),
};

const validPayload: CognitoJwtPayload = {
  sub: 'cognito-sub-1',
  email: 'test@example.com',
  given_name: 'João',
  family_name: 'Silva',
  'cognito:username': 'joaosilva',
  token_use: 'id',
  iss: 'https://cognito-idp.sa-east-1.amazonaws.com/sa-east-1_TestPool',
  aud: 'test-client-id',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
};

describe('CognitoJwtStrategy', () => {
  let strategy: CognitoJwtStrategy;

  beforeEach(() => {
    // Instanciamos diretamente (sem NestJS DI) pois o construtor está mockado
    strategy = new CognitoJwtStrategy(
      mockConfig as unknown as ConfigService,
      mockUsersService as unknown as UsersService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('validate', () => {
    it('deve chamar findOrCreateByCognito com os dados do payload e retornar o usuário', async () => {
      const user = { id: 'user-uuid', email: 'test@example.com' };
      mockUsersService.findOrCreateByCognito.mockResolvedValue(user);

      const result = await strategy.validate(validPayload);

      expect(mockUsersService.findOrCreateByCognito).toHaveBeenCalledWith({
        cognitoSub: validPayload.sub,
        email: validPayload.email,
        givenName: validPayload.given_name,
        familyName: validPayload.family_name,
        displayName: undefined,
        avatarUrl: undefined,
        cognitoUsername: validPayload['cognito:username'],
      });
      expect(result).toBe(user);
    });

    it('deve lançar UnauthorizedException quando token_use não é "id"', async () => {
      const accessPayload: CognitoJwtPayload = {
        ...validPayload,
        token_use: 'access',
      };

      await expect(strategy.validate(accessPayload)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockUsersService.findOrCreateByCognito).not.toHaveBeenCalled();
    });
  });
});
