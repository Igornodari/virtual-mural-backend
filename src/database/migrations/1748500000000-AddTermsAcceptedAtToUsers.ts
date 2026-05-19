import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * LGPD — adiciona campo termsAcceptedAt à tabela users.
 *
 * Nullable: usuários existentes ficam com null (precisarão aceitar
 * os termos na próxima sessão via modal de consentimento).
 */
export class AddTermsAcceptedAtToUsers1748500000000 implements MigrationInterface {
  name = 'AddTermsAcceptedAtToUsers1748500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMPTZ NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "termsAcceptedAt"`,
    );
  }
}
