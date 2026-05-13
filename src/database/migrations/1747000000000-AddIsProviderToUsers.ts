import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona a flag `isProvider` em `users` e migra os dados existentes.
 *
 * Contexto:
 * Antes desta migration, o papel do usuário era determinado por um enum
 * exclusivo `roleInCondominium = 'provider' | 'customer'`. Esse modelo
 * impedia que o prestador também agendasse serviços (uma falha relatada
 * pelos usuários) e forçava uma escolha rígida no onboarding.
 *
 * Novo modelo:
 *   - Todo usuário autenticado e vinculado a um condomínio é, por padrão,
 *     morador (não precisa de campo explícito).
 *   - `isProvider` é um opt-in que dá acesso à área de prestador.
 *   - `roleInCondominium` é mantido nullable por compatibilidade até que
 *     o frontend antigo saia de produção. Será removido numa migration
 *     futura.
 *
 * Migração de dados:
 *   - Usuários com `roleInCondominium = 'provider'` recebem `isProvider = true`.
 *   - Usuários com `roleInCondominium = 'customer'` ou NULL mantêm `false`.
 */
export class AddIsProviderToUsers1747000000000 implements MigrationInterface {
  name = 'AddIsProviderToUsers1747000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "isProvider" boolean NOT NULL DEFAULT false
    `);

    // Migra prestadores existentes para o novo modelo
    await queryRunner.query(`
      UPDATE "users"
      SET "isProvider" = true
      WHERE "roleInCondominium" = 'provider'
    `);

    // Backfill defensivo: qualquer usuário com ao menos um serviço
    // cadastrado é prestador, independente do `roleInCondominium`. Isso
    // cobre o caso (raro mas possível) em que dados ficaram dessincronizados.
    await queryRunner.query(`
      UPDATE "users" u
      SET "isProvider" = true
      WHERE EXISTS (
        SELECT 1 FROM "services" s WHERE s."providerId" = u.id
      )
    `);

    // Index parcial para queries que filtram prestadores ativos
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_is_provider"
      ON "users" ("isProvider")
      WHERE "isProvider" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_users_is_provider"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "isProvider"
    `);
  }
}
