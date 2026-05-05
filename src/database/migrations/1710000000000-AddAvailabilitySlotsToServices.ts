import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvailabilitySlotsToServices1710000000000 implements MigrationInterface {
  name = 'AddAvailabilitySlotsToServices1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "services"
      ADD COLUMN IF NOT EXISTS "availabilitySlots" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "services"
      DROP COLUMN IF EXISTS "availabilitySlots"
    `);
  }
}
