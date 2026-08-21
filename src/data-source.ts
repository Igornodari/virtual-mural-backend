import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { Appointment } from './appointments/entities/appointment.entity';
import { Payment } from './appointments/entities/payment.entity';
import { ProcessedWebhookEvent } from './appointments/entities/processed-webhook-event.entity';
import { Condominium } from './condominiums/entities/condominium.entity';
import { Notification } from './notifications/entities/notification.entity';
import { PushSubscription } from './notifications/entities/push-subscription.entity';
import { Review } from './reviews/entities/review.entity';
import { Service } from './services/entities/service.entity';
import { User } from './users/entities/user.entity';

function getEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Variável de ambiente ${name} não encontrada.`);
  }

  return value;
}

export default new DataSource({
  type: 'postgres',
  host: getEnv('DB_HOST'),
  port: Number(process.env.DB_PORT ?? 5432),
  username: getEnv('DB_USERNAME'),
  password: getEnv('DB_PASSWORD'),
  database: getEnv('DB_NAME'),

  entities: [
    Appointment,
    Condominium,
    Notification,
    Payment,
    ProcessedWebhookEvent,
    PushSubscription,
    Review,
    Service,
    User,
  ],
  migrations: ['src/database/migrations/*.ts'],

  synchronize: false,
});
