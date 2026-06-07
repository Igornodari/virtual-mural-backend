import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureIsProviderColumnOnUsers1780690148105 implements MigrationInterface {
  name = 'EnsureIsProviderColumnOnUsers1780690148105';

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
  }
}
