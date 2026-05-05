import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScheduledTimeToAppointments1710000000001 implements MigrationInterface {
  name = 'AddScheduledTimeToAppointments1710000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appointments"
      ADD COLUMN IF NOT EXISTS "scheduledTime" time
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appointments"
      DROP COLUMN IF EXISTS "scheduledTime"
    `);
  }
}
