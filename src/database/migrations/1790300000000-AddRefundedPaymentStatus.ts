import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona `refunded` ao enum de status de pagamento.
 *
 * Antes disto não havia como registrar um estorno: o backend não tinha
 * nenhuma rotina de reembolso, e o status parava em `paid`.
 *
 * Nota sobre enums do Postgres: `ADD VALUE` não pode rodar dentro de um bloco
 * de transação em versões anteriores à 12. O projeto roda em Postgres 16, onde
 * isso é permitido — mas o `IF NOT EXISTS` fica de qualquer forma, para a
 * migration ser idempotente como as demais do projeto.
 */
export class AddRefundedPaymentStatus1790300000000 implements MigrationInterface {
  name = 'AddRefundedPaymentStatus1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "payments_status_enum" ADD VALUE IF NOT EXISTS 'refunded'
    `);
  }

  public async down(): Promise<void> {
    // O Postgres não permite remover um valor de enum. Reverter exigiria
    // recriar o tipo e reescrever a coluna — perigoso e sem ganho, já que o
    // valor extra é inofensivo para quem não o usa.
  }
}
