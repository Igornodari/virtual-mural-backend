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

  /**
   * Preço legado em texto (mantido para compatibilidade com registros antigos).
   * Novos serviços devem usar priceInCents.
   */
  @Column({ nullable: true })
  price: string;

  /**
   * Preço em centavos BRL para pagamentos in-app.
   * Ex: 5000 = R$ 50,00. Null = serviço sem preço fixo (contato via WhatsApp).
   */
  @Column({ type: 'integer', nullable: true })
  priceInCents: number;

  @Column()
  contact: string;

  @Column()
  category: string;

  @Column('simple-array')
  availableDays: string[];

  /**
   * Horários disponíveis para agendamento. Ex: ["09:00","14:00","18:00"]
   * Null = sem horário fixo.
   */
  @Column('simple-array', { nullable: true })
  availableSlots: string[];

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ default: 0 })
  totalReviews: number;

  // ── Métricas de engajamento (registradas pelo cliente) ─────────────────────
  @Column({ default: 0 })
  clicks: number;

  @Column({ default: 0 })
  interests: number;

  @Column({ default: 0 })
  completions: number;

  @Column({ default: 0 })
  abandonments: number;

  @Column({ default: true })
  isActive: boolean;

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
