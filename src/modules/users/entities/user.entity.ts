// src/modules/users/entities/user.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Property } from '../../properties/entities/property.entity';
import { UserSearchFeedback } from '../../requests/entities/request.entity';
import { Favorite } from '../../favorites/entities/favorite.entity';
import { Rating } from '../../ratings/entities/rating.entity';
import { SearchPreference } from '../../search-preferences/entities/search-preference.entity';
import { Comment } from '../../comments/entities/comment.entity';
import { Notification } from '../../notifications/entities/notification.entity';
import { Role } from '../enums/role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  surname: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  photo?: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password?: string;

  @Column({ default: false })
  profileIncomplete: boolean;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ── Relaciones con CASCADE DELETE ─────────────────────────────────────────

  @OneToMany(() => Property, property => property.agent)
  properties: Property[];

  @OneToMany(() => Rating, rating => rating.user, { cascade: true, onDelete: 'CASCADE' } as any)
  ratings: Rating[];

  @OneToMany(() => Comment, comment => comment.user, { cascade: true, onDelete: 'CASCADE' } as any)
  comments: Comment[];

  @OneToMany(() => SearchPreference, sp => sp.user, { cascade: true, onDelete: 'CASCADE' } as any)
  searchPreferences: SearchPreference[];

  @OneToMany(() => Notification, notification => notification.user, { cascade: true, onDelete: 'CASCADE' } as any)
  notifications: Notification[];

  @OneToMany(() => Favorite, favorite => favorite.user, { cascade: true, onDelete: 'CASCADE' } as any)
  favorites: Favorite[];

//   @OneToMany(() => UserSearchFeedback, feedback => feedback.user, { cascade: true, onDelete: 'CASCADE' } as any)
//   feedbacks: UserSearchFeedback[];
}