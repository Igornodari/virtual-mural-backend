/**
 * Helpers para testes de integração com banco de dados real.
 *
 * Pré-requisito: variável de ambiente DATABASE_URL_TEST apontando para
 * um banco PostgreSQL de teste (ex: "postgres://user:pass@localhost:5432/mural_test").
 *
 * O banco é criado com synchronize: true — todas as tabelas são geradas
 * automaticamente e destruídas ao final da suite.
 *
 * Uso:
 *   const { dataSource, module } = await createIntegrationDataSource([Service, User, ...]);
 *   afterAll(async () => { await dataSource.destroy(); await module.close(); });
 */

import { DataSource } from 'typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';

export const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;

/**
 * `describe` que pula automaticamente quando DATABASE_URL_TEST não está configurada.
 * Evita falhas em ambientes sem banco de teste (CI sem Postgres, máquinas locais simples).
 */
export const describeIntegration = DATABASE_URL_TEST ? describe : describe.skip;

export interface IntegrationTestContext {
  dataSource: DataSource;
  module: TestingModule;
}

/**
 * Cria um DataSource de teste e um TestingModule NestJS conectado a ele.
 * O banco usa `synchronize: true` para criar tabelas automaticamente.
 */
export async function createIntegrationModule(
  entities: EntityClassOrSchema[],
  extraModules: Parameters<typeof Test.createTestingModule>[0]['imports'] = [],
  extraProviders: Parameters<typeof Test.createTestingModule>[0]['providers'] = [],
): Promise<IntegrationTestContext> {
  if (!DATABASE_URL_TEST) {
    throw new Error(
      'DATABASE_URL_TEST não configurada. Defina a variável de ambiente antes de rodar testes de integração.',
    );
  }

  const module = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: DATABASE_URL_TEST,
        entities,
        synchronize: true,      // Cria tabelas automaticamente (apenas teste)
        dropSchema: false,       // Não destrói — usamos clearTable() entre testes
        logging: false,
      }),
      TypeOrmModule.forFeature(entities),
      ...(extraModules ?? []),
    ],
    providers: [...(extraProviders ?? [])],
  }).compile();

  const dataSource = module.get(DataSource);
  return { dataSource, module };
}

/**
 * Trunca as tabelas fornecidas entre testes para isolamento.
 * Desativa FK temporariamente para evitar erros de constraint.
 */
export async function clearTables(
  dataSource: DataSource,
  tableNames: string[],
): Promise<void> {
  await dataSource.query('SET session_replication_role = replica');
  for (const table of tableNames) {
    await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE`);
  }
  await dataSource.query('SET session_replication_role = DEFAULT');
}
