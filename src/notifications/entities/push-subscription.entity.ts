import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Inscrição Web Push (RFC 8030 / W3C Push API) de um usuário.
 *
 * Cada dispositivo/navegador gera UMA subscription com `endpoint`
 * único. Guardamos `endpoint` + chaves p256dh/auth para que o servidor
 * possa criptografar payloads e enviar via VAPID.
 *
 * Importante: a `endpoint` pode invalidar quando o navegador limpa
 * dados ou o usuário desativa as notificações. O backend deve remover
 * a row quando o envio retornar 404/410.
 */
@Entity('push_subscriptions')
@Unique(['endpoint'])
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  @Index()
  userId: string;

  /** Endpoint único fornecido pelo Push Service do navegador. */
  @Column({ type: 'text' })
  endpoint: string;

  /** Chave pública do cliente (P-256), em base64url. */
  @Column({ type: 'text' })
  p256dh: string;

  /** Segredo de autenticação (16 bytes), em base64url. */
  @Column({ type: 'text' })
  auth: string;

  /** User-Agent do dispositivo no momento da inscrição (debug/UX). */
  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
