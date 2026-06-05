import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixMissingIsProviderOnUsers1749125000000 implements MigrationInterface {
  name = 'FixMissingIsProviderOnUsers1749125000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "isProvider" boolean NOT NULL DEFAULT false
    `);

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
