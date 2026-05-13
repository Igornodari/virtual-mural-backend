import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remove os campos legados do modelo de papéis em `users`:
 *   - `roleInCondominium` (enum 'provider' | 'customer') — substituído
 *     pela flag opt-in `isProvider`.
 *   - `roleCompleted` — onboarding agora exige apenas vínculo com
 *     condomínio. Ser prestador é opt-in pós-onboarding.
 *
 * Pré-requisitos:
 *   - A migration `AddIsProviderToUsers1747000000000` precisa ter sido
 *     executada antes desta (ela já migrou os dados de
 *     `roleInCondominium='provider'` para `isProvider=true`).
 *   - O frontend novo precisa estar 100% em produção antes deste
 *     drop — clientes em versões antigas usavam estes campos.
 *
 * Rollback (`down`):
 *   - Recria as colunas e o enum. NÃO restaura os valores antigos,
 *     porque a informação útil já foi preservada em `isProvider`.
 *     Após o rollback, `roleInCondominium` ficará NULL para todos e
 *     `roleCompleted` ficará false — basta o app antigo refazer o
 *     onboarding se for o caso.
 */
export class DropLegacyRoleColumnsFromUsers1747500000000
  implements MigrationInterface
{
  name = 'DropLegacyRoleColumnsFromUsers1747500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "roleInCondominium"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "roleCompleted"
    `);

    // Remove o tipo enum órfão (TypeORM cria o tipo a partir do nome
    // da tabela + coluna). Se outras colunas usarem o mesmo nome de
    // tipo, o DROP TYPE falha silenciosamente.
    await queryRunner.query(`
      DO $$ BEGIN
        DROP TYPE IF EXISTS "users_roleincondominium_enum";
      EXCEPTION
        WHEN dependent_objects_still_exist THEN null;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recria o enum (idempotente)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "users_roleincondominium_enum" AS ENUM ('provider', 'customer');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "roleInCondominium" "users_roleincondominium_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "roleCompleted" boolean NOT NULL DEFAULT false
    `);

    // Reconstrói `roleInCondominium='provider'` a partir de
    // `isProvider=true` para manter consistência com o app antigo.
    await queryRunner.query(`
      UPDATE "users"
      SET "roleInCondominium" = 'provider', "roleCompleted" = true
      WHERE "isProvider" = true
    `);

    // Usuários que não são prestadores recebem o papel de cliente.
    await queryRunner.query(`
      UPDATE "users"
      SET "roleInCondominium" = 'customer', "roleCompleted" = true
      WHERE "isProvider" = false AND "condominiumId" IS NOT NULL
    `);
  }
}
