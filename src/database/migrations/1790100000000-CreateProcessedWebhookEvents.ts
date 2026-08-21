import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registro de eventos de webhook já processados, para tornar o endpoint da
 * Stripe idempotente.
 *
 * Idempotente por si só (`IF NOT EXISTS`), seguindo o padrão das migrations
 * `Ensure...` do projeto — ambientes que já rodaram parte do histórico não
 * quebram.
 */
export class CreateProcessedWebhookEvents1790100000000 implements MigrationInterface {
  name = 'CreateProcessedWebhookEvents1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "processed_webhook_events" (
        "eventId" character varying(255) NOT NULL,
        "eventType" character varying(100) NOT NULL,
        "processedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_processed_webhook_events" PRIMARY KEY ("eventId")
      )
    `);

    // Consulta de poda por data (ver Q-011, prazo de retenção ainda em aberto).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_processed_webhook_events_processedAt"
        ON "processed_webhook_events" ("processedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_processed_webhook_events_processedAt"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "processed_webhook_events"`);
  }
}
