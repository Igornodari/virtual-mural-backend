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
import { Condominium } from '../../condominiums/entities/condominium.entity';
import { Service } from '../../services/entities/service.entity';
import { Appointment } from '../../appointments/entities/appointment.entity';
import { Review } from '../../reviews/entities/review.entity';

export type UserRole = 'provider' | 'customer';
export type AuthProvider = 'google' | 'cognito' | 'email-password' | 'unknown';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  cognitoSub: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  givenName: string;

  @Column({ nullable: true })
  familyName: string;

  @Column({ nullable: true })
  displayName: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  cognitoUsername: string;

  @Column({
    type: 'enum',
    enum: ['google', 'cognito', 'email-password', 'unknown'],
    default: 'unknown',
  })
  authProvider: AuthProvider;

  // ── Onboarding ─────────────────────────────────────────────────────────────
  @Column({
    type: 'enum',
    enum: ['provider', 'customer'],
    nullable: true,
  })
  roleInCondominium: UserRole | null;

  @Column({ default: false })
  onboardingCompleted: boolean;

  @Column({ default: false })
  addressCompleted: boolean;

  @Column({ default: false })
  roleCompleted: boolean;

  // ── Relacionamentos ────────────────────────────────────────────────────────
  @ManyToOne(() => Condominium, (condo) => condo.users, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'condominiumId' })
  condominium: Condominium | null;

  @Column({ nullable: true })
  condominiumId: string | null;

  @OneToMany(() => Service, (service) => service.provider)
  services: Service[];

  @OneToMany(() => Appointment, (appointment) => appointment.customer)
  appointments: Appointment[];

  @OneToMany(() => Review, (review) => review.author)
  reviews: Review[];

  // ── Stripe Connect ─────────────────────────────────────────────────────────
  /** ID da conta Stripe Express do prestador (acct_xxx) */
  @Column({ type: 'varchar', nullable: true })
  stripeAccountId: string | null;

  /** Status do onboarding Stripe Connect */
  @Column({
    type: 'enum',
    enum: ['pending', 'active', 'restricted'],
    nullable: true,
  })
  stripeAccountStatus: 'pending' | 'active' | 'restricted' | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
