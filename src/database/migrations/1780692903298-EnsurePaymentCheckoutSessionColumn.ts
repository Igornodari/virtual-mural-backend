import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsurePaymentCheckoutSessionColumn1780692903298 implements MigrationInterface {
  name = 'EnsurePaymentCheckoutSessionColumn1780692903298';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD COLUMN IF NOT EXISTS "checkoutSessionId" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payments"
      DROP COLUMN IF EXISTS "checkoutSessionId"
    `);
  }
}
