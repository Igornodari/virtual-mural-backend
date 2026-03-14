import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Service } from '../../services/entities/service.entity';

export type AppointmentStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'refunded';

@Entity('appointments')
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  scheduledDate: Date;

  @Column({ nullable: true })
  scheduledDay: string;

  /** Horário agendado. Ex: "14:00" */
  @Column({ nullable: true })
  scheduledSlot: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({
    type: 'enum',
    enum: ['pending_payment', 'confirmed', 'in_progress', 'completed', 'cancelled', 'refunded'],
    default: 'pending_payment',
  })
  status: AppointmentStatus;

  // ── Pagamento Stripe ────────────────────────────────────────────────────────
  /** ID do PaymentIntent no Stripe */
  @Column({ nullable: true })
  stripePaymentIntentId: string;

  /** ClientSecret para confirmar o pagamento no frontend */
  @Column({ nullable: true })
  stripeClientSecret: string;

  /** Valor pago em centavos BRL */
  @Column({ type: 'integer', nullable: true })
  amountInCents: number;

  /** Timestamp do pagamento confirmado */
  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date;

  /** Timestamp da confirmação de conclusão pelo morador */
  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  /** Timestamp do cancelamento */
  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date;

  /** ID do reembolso no Stripe */
  @Column({ nullable: true })
  stripeRefundId: string;

  // ── Relacionamentos ────────────────────────────────────────────────────────
  @ManyToOne(() => User, (user) => user.appointments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: User;

  @Column()
  customerId: string;

  @ManyToOne(() => Service, (service) => service.appointments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'serviceId' })
  service: Service;

  @Column()
  serviceId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
