import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona `durationMinutes` e `breakBetweenAppointmentsMinutes` em `services`.
 *
 * Usadas para gerar a grade de horários disponíveis (passo = duração + pausa)
 * e bloquear o intervalo ocupado por agendamentos confirmados.
 *
 * Defaults seguros para serviços antigos: duração 60, pausa 0 (comportamento
 * equivalente ao anterior de slots de 1h).
 * Idempotente: seguro em bancos que já tenham as colunas.
 */
export class AddDurationAndBreakToServices1780710000000
  implements MigrationInterface
{
  name = 'AddDurationAndBreakToServices1780710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "services"
      ADD COLUMN IF NOT EXISTS "durationMinutes" integer NOT NULL DEFAULT 60
    `);

    await queryRunner.query(`
      ALTER TABLE "services"
      ADD COLUMN IF NOT EXISTS "breakBetweenAppointmentsMinutes" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "services"
      DROP COLUMN IF EXISTS "breakBetweenAppointmentsMinutes"
    `);

    await queryRunner.query(`
      ALTER TABLE "services"
      DROP COLUMN IF EXISTS "durationMinutes"
    `);
  }
}
