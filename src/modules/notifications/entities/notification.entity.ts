import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';

export type NotificationTargetRole = 'user' | 'admin';

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

  @CreateDateColumn()
  createdAt: Date;
}