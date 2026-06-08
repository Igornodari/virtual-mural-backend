import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Garante as colunas `onboardingCompleted` e `addressCompleted` em `users`.
 *
 * A entity `User` declara essas colunas (default false), mas nenhuma migration
 * anterior as criava — em um ambiente provisionado APENAS por migrations elas
 * faltavam e o `GET /users/me` quebrava com
 * `column User.onboardingCompleted does not exist` (mesmo sintoma do bug do
 * `isProvider`). Idempotente: seguro de rodar em bancos que já têm as colunas.
 */
export class EnsureUserOnboardingColumns1780700000000
  implements MigrationInterface
{
  name = 'EnsureUserOnboardingColumns1780700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "onboardingCompleted" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "addressCompleted" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "addressCompleted"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "onboardingCompleted"
    `);
  }
}
