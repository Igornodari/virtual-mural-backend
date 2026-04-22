import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { UsersService } from '../../users/users.service';

export interface CognitoJwtPayload {
  sub: string;
  email: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
  'cognito:username'?: string;
  'cognito:groups'?: string[];
  token_use: 'id' | 'access';
  iss: string;
  aud: string;
  exp: number;
  iat: number;
}

@Injectable()
export class CognitoJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const region = config.getOrThrow<string>('AWS_REGION');
    const userPoolId = config.getOrThrow<string>('COGNITO_USER_POOL_ID');
    const clientId = config.getOrThrow<string>('COGNITO_CLIENT_ID');
    const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      audience: clientId,
      issuer,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${issuer}/.well-known/jwks.json`,
      }),
    });
  }

  async validate(payload: CognitoJwtPayload) {
    if (payload.token_use !== 'id') {
      throw new UnauthorizedException(
        'Token inválido: use o ID Token do Cognito.',
      );
    }

    // Upsert automático: cria o perfil do usuário na primeira vez que ele faz login
    const user = await this.usersService.findOrCreateByCognito({
      cognitoSub: payload.sub,
      email: payload.email,
      givenName: payload.given_name,
      familyName: payload.family_name,
      displayName: payload.name,
      avatarUrl: payload.picture,
      cognitoUsername: payload['cognito:username'],
    });

    return user;
  }
}
