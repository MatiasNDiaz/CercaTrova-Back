import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { NotificationType } from '../enums/notification-type.enum';

export type NotificationTargetRole = 'user' | 'admin';

/**
 * Índices: esta tabla es la más consultada de la app — la campanita del
 * frontend pide `/notifications/unread-count` cada 60 segundos por usuario
 * conectado, y sin índice eso es un seq scan sobre la tabla entera cada vez.
 *
 * · `(user, targetRole)` → `getForUser()` y el conteo de no leídas del usuario.
 * · `(targetRole, read)`  → el feed del admin y su conteo de no leídas.
 */
@Index(['user', 'targetRole'])
@Index(['targetRole', 'read'])
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, user => user.notifications, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  title: string;

  @Column()
  message: string;

  @Column({ nullable: true })
  propertyId: number;

  @Column({ default: false })
  read: boolean;

  // 'user'  → notificación para usuarios normales
  // 'admin' → notificación para administradores
  @Column({ type: 'varchar', default: 'user' })
  targetRole: NotificationTargetRole;

  /**
   * Qué originó la notificación. El frontend clasifica por acá (ícono, color,
   * a dónde navega) en vez de buscar substrings en el texto en español, que se
   * rompía con cualquier cambio de redacción.
   *
   * `targetRole` decide en qué feed aparece; `type` decide cómo se muestra.
   */
  @Column({ type: 'varchar', default: NotificationType.GENERICA })
  type: NotificationType;

  @Column({ nullable: true })   // 👈 única línea nueva
  relatedUserId: number;


  @CreateDateColumn()
  createdAt: Date;
}