import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Appointment } from './appointment.entity';

export type PaymentMethod = 'pix' | 'credit_card';
export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed';

@Entity('payments')
@Index(['appointmentId', 'externalPaymentId'], { unique: true })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  appointmentId: string;

  @ManyToOne(() => Appointment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appointmentId' })
  appointment: Appointment;

  @Column({ type: 'enum', enum: ['pix', 'credit_card'] })
  method: PaymentMethod;

  @Column({ type: 'enum', enum: ['pending', 'processing', 'paid', 'failed'] })
  status: PaymentStatus;

  @Column()
  externalPaymentId: string;

  /** ID da Checkout Session do Stripe (cs_...) — usado para verificar status pós-redirect */
  @Column({ type: 'varchar', nullable: true })
  checkoutSessionId: string | null;

  @Column({ nullable: true })
  checkoutUrl: string;

  @Column({ nullable: true })
  qrCode: string;

  @Column({ nullable: true })
  qrCodeText: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
