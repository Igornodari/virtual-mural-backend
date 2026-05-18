import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsAndPushSubscriptionsTables1748000000001 implements MigrationInterface {
  name = 'CreateNotificationsAndPushSubscriptionsTables1748000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Garantir extensão uuid-ossp ───────────────────────────────────────────
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ── Enum: notification_type ───────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "notification_type_enum" AS ENUM (
          'NEW_APPOINTMENT_REQUEST',
          'APPOINTMENT_CONFIRMED',
          'APPOINTMENT_REJECTED',
          'CUSTOMER_CANCELLED',
          'PROVIDER_CANCELLED',
          'APPOINTMENT_REMINDER',
          'APPOINTMENT_COMPLETED',
          'PAYMENT_CONFIRMED',
          'PAYMENT_FAILED',
          'PAYMENT_PENDING_PROVIDER',
          'RESCHEDULE_REQUESTED',
          'RESCHEDULE_ACCEPTED',
          'RESCHEDULE_REJECTED',
          'NEW_SERVICE_AVAILABLE',
          'NEW_REVIEW'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    // ── Enum: notification_severity ───────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "notification_severity_enum" AS ENUM (
          'info',
          'success',
          'warning',
          'error'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    // ── Table: notifications ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id"          UUID                          NOT NULL DEFAULT uuid_generate_v4(),
        "recipientId" UUID                          NOT NULL,
        "type"        "notification_type_enum"      NOT NULL,
        "severity"    "notification_severity_enum"  NOT NULL DEFAULT 'info',
        "payload"     JSONB                         NOT NULL DEFAULT '{}'::jsonb,
        "actionUrl"   VARCHAR                       NULL,
        "read"        BOOLEAN                       NOT NULL DEFAULT false,
        "readAt"      TIMESTAMPTZ                   NULL,
        "createdAt"   TIMESTAMPTZ                   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_recipient"
          FOREIGN KEY ("recipientId")
          REFERENCES "users" ("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_recipientId_read_createdAt"
        ON "notifications" ("recipientId", "read", "createdAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_recipientId"
        ON "notifications" ("recipientId")
    `);

    // ── Table: push_subscriptions ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "push_subscriptions" (
        "id"        UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "userId"    UUID      NOT NULL,
        "endpoint"  TEXT      NOT NULL,
        "p256dh"    TEXT      NOT NULL,
        "auth"      TEXT      NOT NULL,
        "userAgent" TEXT      NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_push_subscriptions"   PRIMARY KEY ("id"),
        CONSTRAINT "UQ_push_subscriptions_endpoint" UNIQUE ("endpoint"),
        CONSTRAINT "FK_push_subscriptions_user"
          FOREIGN KEY ("userId")
          REFERENCES "users" ("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_push_subscriptions_userId"
        ON "push_subscriptions" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "push_subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_severity_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_type_enum"`);
  }
}
