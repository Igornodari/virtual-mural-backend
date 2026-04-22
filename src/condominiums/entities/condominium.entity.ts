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
