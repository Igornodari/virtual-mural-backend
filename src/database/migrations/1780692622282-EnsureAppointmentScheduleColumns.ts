import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureAppointmentScheduleColumns1780692622282 implements MigrationInterface {
  name = 'EnsureAppointmentScheduleColumns1780692622282';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appointments"
      ADD COLUMN IF NOT EXISTS "scheduledTime" time
    `);

    await queryRunner.query(`
      ALTER TABLE "appointments"
      ADD COLUMN IF NOT EXISTS "reminderSentAt" timestamp
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appointments"
      DROP COLUMN IF EXISTS "reminderSentAt"
    `);

    await queryRunner.query(`
      ALTER TABLE "appointments"
      DROP COLUMN IF EXISTS "scheduledTime"
    `);
  }
}
