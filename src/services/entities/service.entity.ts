import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Condominium } from '../../condominiums/entities/condominium.entity';
import { Appointment } from '../../appointments/entities/appointment.entity';
import { Review } from '../../reviews/entities/review.entity';

@Entity('services')
export class Service {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column()
  price: string;

  @Column()
  contact: string;

  @Column()
  category: string;

  @Column('simple-array')
  availableDays: string[];

  /** Disponibilidade por dia com horários de início e fim */
  @Column({ type: 'json', nullable: true })
  availabilitySlots:
    | { day: string; startTime: string; endTime: string }[]
    | null;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ default: 0 })
  totalReviews: number;

  @Column({ default: true })
  isActive: boolean;

  // ── Métricas de engajamento ────────────────────────────────────────────────
  /** Número de vezes que o card foi expandido/visualizado */
  @Column({ default: 0 })
  clicks: number;

  /** Número de vezes que o botão "Entrar em contato" foi clicado */
  @Column({ default: 0 })
  interests: number;

  /** Número de agendamentos com status COMPLETED */
  @Column({ default: 0 })
  completions: number;

  /** Número de agendamentos com status CANCELLED */
  @Column({ default: 0 })
  abandonments: number;

  // ── Relacionamentos ────────────────────────────────────────────────────────
  @ManyToOne(() => User, (user) => user.services, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'providerId' })
  provider: User;

  @Column()
  providerId: string;

  @ManyToOne(() => Condominium, (condo) => condo.services, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'condominiumId' })
  condominium: Condominium;

  @Column()
  condominiumId: string;

  @OneToMany(() => Appointment, (appointment) => appointment.service)
  appointments: Appointment[];

  @OneToMany(() => Review, (review) => review.service)
  reviews: Review[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
