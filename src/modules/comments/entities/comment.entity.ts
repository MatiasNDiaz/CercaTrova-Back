import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Property } from '../../properties/entities/property.entity';

// Índices de FK: Postgres NO los crea solo. 'propertyId' lo usa el listado de
// comentarios de cada propiedad y 'userId' el dashboard "mis comentarios";
// además ambos aceleran el CASCADE al borrar una propiedad o un usuario.
@Index(['propertyId'])
@Index(['userId'])
@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  message: string;

  /**
   * Moderación blanda del admin: el comentario no se borra, deja de mostrarse
   * a los usuarios comunes. El admin lo sigue viendo, marcado como oculto.
   * Mismo criterio que `PostComment.isHidden` en Publicaciones.
   */
  @Column({ default: false })
  isHidden: boolean;

  @CreateDateColumn()
  created_at: Date;

  // 👇 columnas necesarias para filtrar fácilmente
  @Column()
  userId: number;

  @Column()
  propertyId: number;

  // 👇 relaciones
  @ManyToOne(() => User, user => user.comments, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Property, property => property.comments, { onDelete: 'CASCADE' })
  property: Property;
}
