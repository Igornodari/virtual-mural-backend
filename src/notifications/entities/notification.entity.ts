import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Catálogo único de tipos de notificação in-app.
 *
 * O backend NÃO persiste textos traduzidos; o frontend resolve o
 * `type` + `payload` no idioma escolhido pelo usuário. Para email/SMS
 * usamos templates server-side separados.
 *
 * IMPORTANTE: manter sincronizado com as chaves i18n do frontend em
 * `assets/i18n/{pt,en}/notifications.json` → NOTIFICATIONS.TYPES.<TYPE>.
 */
export enum NotificationType {
  // ── Agendamento ──────────────────────────────────────────────────────────
  /** Cenário 1: morador solicitou agendamento → notifica prestador */
  NEW_APPOINTMENT_REQUEST = 'NEW_APPOINTMENT_REQUEST',
  /** Cenário 2: prestador confirmou → notifica morador */
  APPOINTMENT_CONFIRMED = 'APPOINTMENT_CONFIRMED',
  /** Cenário 3: prestador rejeitou → notifica morador */
  APPOINTMENT_REJECTED = 'APPOINTMENT_REJECTED',
  /** Cenário 6: morador cancelou → notifica prestador */
  CUSTOMER_CANCELLED = 'CUSTOMER_CANCELLED',
  /** Cenário 7: prestador cancelou → notifica morador */
  PROVIDER_CANCELLED = 'PROVIDER_CANCELLED',
  /** Cenário 9: lembrete antes do horário → notifica ambos */
  APPOINTMENT_REMINDER = 'APPOINTMENT_REMINDER',
  /** Cenário 10: serviço concluído → notifica morador (pede avaliação) */
  APPOINTMENT_COMPLETED = 'APPOINTMENT_COMPLETED',

  // ── Pagamento ────────────────────────────────────────────────────────────
  /** Cenário 4: pagamento confirmado → notifica prestador */
  PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
  /** Cenário 5: pagamento falhou → notifica morador */
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  /** Cenário 5 (opcional): notifica prestador que o pagamento não saiu */
  PAYMENT_PENDING_PROVIDER = 'PAYMENT_PENDING_PROVIDER',

  // ── Reagendamento (Cenário 8) ────────────────────────────────────────────
  RESCHEDULE_REQUESTED = 'RESCHEDULE_REQUESTED',
  RESCHEDULE_ACCEPTED = 'RESCHEDULE_ACCEPTED',
  RESCHEDULE_REJECTED = 'RESCHEDULE_REJECTED',

  // ── Extras (boa cobertura mesmo que não pedidos) ─────────────────────────
  /** Novo serviço publicado no condomínio → notifica moradores */
  NEW_SERVICE_AVAILABLE = 'NEW_SERVICE_AVAILABLE',
  /** Avaliação recebida → notifica prestador */
  NEW_REVIEW = 'NEW_REVIEW',
}

/**
 * Severidade afeta apresentação (cor do ícone, prioridade, etc).
 * Para Push, severidades INFO/SUCCESS podem ser silenciosas em mobile,
 * enquanto WARNING/ERROR devem vibrar o dispositivo.
 */
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

/**
 * Payload típico esperado para cada tipo. NÃO é validado em runtime;
 * o frontend resolve as chaves de tradução com fallback gracioso.
 *
 * Convenções:
 *   - datas: ISO string (`scheduledDate`)
 *   - horários: `HH:mm`
 *   - sempre incluir o `serviceName` quando disponível
 */
export interface NotificationPayload {
  appointmentId?: string;
  serviceId?: string;
  serviceName?: string;

  customerId?: string;
  customerName?: string;
  providerId?: string;
  providerName?: string;

  scheduledDate?: string;
  scheduledDay?: string;
  scheduledTime?: string;

  amount?: string;
  currency?: string;

  rating?: number;
  reviewId?: string;

  /** URL relativa do frontend para onde a notificação deve levar */
  actionUrl?: string;

  /** Campos arbitrários adicionais por tipo */
  [key: string]: unknown;
}

@Entity('notifications')
@Index(['recipientId', 'read', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Usuário que recebe a notificação. Sempre referencia `users.id`.
   * Em casos onde a mesma ação gera notificação para 2 partes (ex.
   * cancelamento), criamos DUAS linhas — uma para cada destinatário.
   */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipientId' })
  recipient: User;

  @Column()
  @Index()
  recipientId: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  type: NotificationType;

  /**
   * Severidade afeta apresentação no frontend (ícone, cor, vibração no
   * push). Default é `info`.
   */
  @Column({
    type: 'enum',
    enum: ['info', 'success', 'warning', 'error'],
    default: 'info',
  })
  severity: NotificationSeverity;

  /**
   * Variáveis usadas para interpolação no frontend (i18n).
   * Backend NUNCA armazena texto traduzido aqui — apenas chaves e vars.
   */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload: NotificationPayload;

  /**
   * Caminho relativo do app para onde o clique deve navegar.
   * Ex.: `/mural/appointments?focus=<id>`. Opcional.
   */
  @Column({ type: 'varchar', nullable: true })
  actionUrl: string | null;

  @Column({ default: false })
  read: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
