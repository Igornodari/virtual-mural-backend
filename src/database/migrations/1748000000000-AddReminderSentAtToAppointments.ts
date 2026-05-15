import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReminderSentAtToAppointments1748000000000
  implements MigrationInterface
{
  name = 'AddReminderSentAtToAppointments1748000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appointments"
      ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appointments"
      DROP COLUMN IF EXISTS "reminderSentAt"
    `);
  }
}
