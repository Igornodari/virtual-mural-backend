import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Registro dos eventos de webhook já processados.
 *
 * A Stripe reentrega o mesmo evento por desenho — em timeout, falha de rede
 * ou retentativa manual pelo painel. O `evt_...` é estável entre reentregas,
 * então ele é a chave natural.
 *
 * A unicidade é garantida pelo banco, não pela aplicação: é ela que desempata
 * duas entregas concorrentes do mesmo evento sem precisar de trava distribuída.
 */
@Entity('processed_webhook_events')
export class ProcessedWebhookEvent {
  /** O `evt_...` da Stripe. */
  @PrimaryColumn({ type: 'varchar', length: 255 })
  eventId: string;

  /** Guardado para diagnóstico: qual tipo de evento repetiu. */
  @Column({ type: 'varchar', length: 100 })
  eventType: string;

  @CreateDateColumn({ type: 'timestamptz' })
  processedAt: Date;
}
