import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona os campos do Stripe Connect na tabela `users`:
 * - stripeAccountId: ID da conta Stripe Express (ex: acct_xxx)
 * - stripeAccountStatus: pending | active | restricted (null se nunca conectou)
 *
 * Necessário para o fluxo de Stripe Connect Express (provedores recebem
 * pagamentos via plataforma com taxa de marketplace de 5%).
 */
export class AddStripeConnectFieldsToUsers1714900000000
  implements MigrationInterface
{
  name = 'AddStripeConnectFieldsToUsers1714900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Cria o tipo enum (idempotente)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "users_stripe_account_status_enum" AS ENUM ('pending', 'active', 'restricted');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "stripeAccountId" varchar
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "stripeAccountStatus" "users_stripe_account_status_enum"
    `);

    // Index pra acelerar lookups via webhook (account.updated → encontrar provider)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_stripe_account_id"
      ON "users" ("stripeAccountId")
      WHERE "stripeAccountId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_users_stripe_account_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "stripeAccountStatus"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "stripeAccountId"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "users_stripe_account_status_enum"
    `);
  }
}
