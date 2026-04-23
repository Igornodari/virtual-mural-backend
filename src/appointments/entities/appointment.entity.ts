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
  | 'pending'
  | 'confirmed'
  | 'awaiting_payment'
  | 'paid'
  | 'cancelled'
  | 'completed';

@Entity('appointments')
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  scheduledDate: Date;

  @Column({ nullable: true })
  scheduledDay: string;

  @Column({ type: 'varchar', nullable: true })
  scheduledTime: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({
    type: 'enum',
    enum: [
      'pending',
      'confirmed',
      'awaiting_payment',
      'paid',
      'cancelled',
      'completed',
    ],
    default: 'pending',
  })
  status: AppointmentStatus;

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
