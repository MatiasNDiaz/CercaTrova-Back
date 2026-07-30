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
import { AuthProvider } from '../enums/auth-provider.enum';

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

  // 🔒 SEGURIDAD (C8): select:false — el password NUNCA se carga en las
  // queries por defecto. Solo el login lo carga explícitamente vía
  // UsersService.findUserByEmailWithPassword().
  @Column({ nullable: true, select: false })
  password?: string;

  @Column({ default: false })
  profileIncomplete: boolean;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  /**
   * Cómo se registró la cuenta. Alimenta la estadística "registros por método"
   * del panel. Default `LOCAL` para que las cuentas que ya existían queden
   * clasificadas como registro por formulario, que es lo que fueron.
   */
  @Column({ type: 'enum', enum: AuthProvider, default: AuthProvider.LOCAL })
  authProvider: AuthProvider;

  // 📧 (M8): opt-out de emails masivos (broadcast de nuevas propiedades y
  // bajas de precio). Las notificaciones in-app no se ven afectadas.
  @Column({ default: true })
  notifyBroadcast: boolean;

  // 🔒 SEGURIDAD (punto 15): versión de token para revocación de sesión.
  // Viaja en el payload del JWT y se compara contra la DB en cada request;
  // logout y cambio de password la incrementan, invalidando al instante
  // todos los tokens emitidos antes.
  @Column({ default: 0 })
  tokenVersion: number;

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