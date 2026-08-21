import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Papéis administrativos e autoria do condomínio.
 *
 * Antes desta migration o CRUD de condomínio exigia apenas estar autenticado:
 * qualquer morador renomeava ou desativava o condomínio de qualquer outro.
 *
 * Idempotente (`IF NOT EXISTS`), no padrão das migrations `Ensure...` do
 * projeto — ambientes que já rodaram parte do histórico não quebram.
 */
export class AddAdminRoles1790200000000 implements MigrationInterface {
  name = 'AddAdminRoles1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "isPlatformAdmin" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "isCondoManager" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "condominiums"
        ADD COLUMN IF NOT EXISTS "createdById" uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "condominiums" DROP COLUMN IF EXISTS "createdById"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "isCondoManager"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "isPlatformAdmin"`,
    );
  }
}
