import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn,
} from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { PostLike } from './post-like.entity';
import { PostComment } from './post-comment.entity';

/**
 * Publicación estilo red social.
 *
 * A diferencia de `Property`, NO tiene campos estructurados (precio, ambientes,
 * ubicación…): esos datos vienen "quemados" dentro de la imagen, que el admin
 * arma por fuera (Canva) y sube ya editada. Acá solo viven la imagen y un texto
 * corto.
 *
 * Las publicaciones son efímeras: un cron las borra a los 7 días (ver
 * `PostsCleanupService`).
 */
@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  description: string;

  @Column()
  imageUrl: string;

  /** `public_id` de Cloudinary — necesario para poder borrar la imagen. */
  @Column()
  imagePublicId: string;

  /**
   * Contador desnormalizado de likes. Se mantiene en sincronía desde
   * `PostsService.toggleLike()` para poder ordenar por "más me gusta" sin una
   * subconsulta por fila.
   */
  @Column({ type: 'int', default: 0 })
  likesCount: number;

  @CreateDateColumn()
  createdAt: Date;

  /** Admin que publicó — mismo criterio que `Property.agent`. */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  agent: User;

  @OneToMany(() => PostLike, (like) => like.post)
  likes: PostLike[];

  @OneToMany(() => PostComment, (comment) => comment.post)
  comments: PostComment[];
}
