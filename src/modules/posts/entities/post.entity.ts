import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn,
} from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { PostLike } from './post-like.entity';
import { PostComment } from './post-comment.entity';
import { PostMedia } from './post-media.entity';

/**
 * Publicación estilo red social.
 *
 * A diferencia de `Property`, NO tiene campos estructurados (precio, ambientes,
 * ubicación…): esos datos vienen "quemados" dentro de la imagen, que el admin
 * arma por fuera (Canva) y sube ya editada. Acá solo viven los medios
 * (imágenes y videos, en `media`) y un texto corto.
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

  /**
   * PORTADA de la publicación: la URL del primer medio (si es un video, su
   * fotograma inicial). Se mantiene desnormalizada a propósito: la usan el
   * email de "nueva publicación", el OpenGraph de `/publicaciones/:id` y
   * cualquier cliente viejo que todavía lea solo esta columna.
   */
  @Column()
  imageUrl: string;

  /**
   * ⚠️ LEGADO. Antes de `post_media` era el `public_id` de la única imagen.
   * Las publicaciones nuevas la dejan en null: sus archivos están en `media`.
   * Las anteriores la conservan (la migración copió esa imagen a `media` sin
   * borrar nada); al limpiar se deduplica contra `media`.
   */
  @Column({ type: 'varchar', nullable: true })
  imagePublicId: string | null;

  /** Imágenes y videos, en el orden de la galería (`order`). */
  @OneToMany(() => PostMedia, (media) => media.post)
  media: PostMedia[];

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
