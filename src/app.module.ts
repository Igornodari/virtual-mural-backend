import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CondominiumsModule } from './condominiums/condominiums.module';
import { ServicesModule } from './services/services.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { ReviewsModule } from './reviews/reviews.module';
import { MessagingModule } from './messaging/messaging.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StripeConnectModule } from './stripe-connect/stripe-connect.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // Rate limiting global: 100 req por 60 segundos por IP
    // Sobrescreva por rota com @Throttle({ default: { limit: 5, ttl: 60000 } })
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60_000, // 60 segundos
            limit: 100, // 100 requisições por IP
          },
          {
            name: 'strict',
            ttl: 60_000,
            limit: 10, // usado em rotas sensíveis
          },
        ],
      }),
    }),

    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isSynchronizeOn =
          config.get<string>('DB_SYNC', 'true') === 'true';

        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST', 'localhost'),
          port: config.get<number>('DB_PORT', 5432),
          username: config.get<string>('DB_USERNAME', 'postgres'),
          password: config.get<string>('DB_PASSWORD', 'postgres'),
          database: config.get<string>('DB_NAME', 'virtual_mural'),
          autoLoadEntities: true,
          synchronize: isSynchronizeOn,
          migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
          migrationsRun: !isSynchronizeOn,
          logging:
            config.get<string>('NODE_ENV') === 'development'
              ? ['error', 'warn']
              : false,
          ssl:
            config.get<string>('NODE_ENV') === 'production'
              ? { rejectUnauthorized: false }
              : false,
        };
      },
    }),

    AuthModule,
    UsersModule,
    CondominiumsModule,
    ServicesModule,
    AppointmentsModule,
    ReviewsModule,
    MessagingModule,
    NotificationsModule,
    StripeConnectModule,
  ],
  providers: [
    // Aplica ThrottlerGuard em TODAS as rotas por padrão
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
