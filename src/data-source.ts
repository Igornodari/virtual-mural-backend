import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { Service } from './services/entities/service.entity';
import { User } from './users/entities/user.entity';
import { Condominium } from './condominiums/entities/condominium.entity';
import { Appointment } from './appointments/entities/appointment.entity';
import { Review } from './reviews/entities/review.entity';

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

  entities: [Service, User, Condominium, Appointment, Review],
  migrations: ['src/database/migrations/*.ts'],

  synchronize: false,
});
