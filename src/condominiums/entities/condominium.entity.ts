import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Service } from '../../services/entities/service.entity';

@Entity('condominiums')
export class Condominium {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  // ── Endereço ───────────────────────────────────────────────────────────────
  @Column()
  addressZipCode: string;

  @Column()
  addressStreet: string;

  @Column()
  addressNumber: string;

  @Column({ nullable: true })
  addressComplement: string;

  @Column()
  addressNeighborhood: string;

  @Column()
  addressCity: string;

  @Column({ length: 2 })
  addressState: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number;

  @Column({ default: true })
  isActive: boolean;

  /**
   * Quem criou este condomínio.
   *
   * A base é alimentada pelos próprios moradores no onboarding, sem curadoria.
   * Sem saber a origem de cada registro não há como limpar as duplicatas nem
   * responsabilizar quem suja a base.
   *
   * Nullable: os registros criados antes desta coluna não têm autor conhecido.
   */
  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  // ── Relacionamentos ────────────────────────────────────────────────────────
  @OneToMany(() => User, (user) => user.condominium)
  users: User[];

  @OneToMany(() => Service, (service) => service.condominium)
  services: Service[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
