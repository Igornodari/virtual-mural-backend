import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Body para `POST /notifications/push-subscription`.
 *
 * Formato espelha o objeto `PushSubscription.toJSON()` do navegador,
 * para que o frontend faça `subscription.toJSON()` e mande direto.
 */
export class RegisterPushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @IsObject()
  keys: {
    p256dh: string;
    auth: string;
  };

  /** Opcional: User-Agent para debugging (preenchido pelo controller). */
  @IsOptional()
  @IsString()
  userAgent?: string;
}
