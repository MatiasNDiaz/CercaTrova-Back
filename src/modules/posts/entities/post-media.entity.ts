import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Post } from './post.entity';

export enum PostMediaType {
  IMAGE = 'image',
  VIDEO = 'video',
}

/**
 * Un medio (imagen o video) de una publicación.
 *
 * Antes cada publicación tenía UNA imagen guardada en columnas propias
 * (`Post.imageUrl` / `Post.imagePublicId`). Para soportar varias imágenes,
 * videos y su orden, los medios pasan a una tabla propia — el mismo patrón que
 * `PropertyImages` para las propiedades. Las publicaciones viejas se migraron
 * acá con su imagen como medio #0 (ver la migración `AddPostMedia`).
 *
 * Los archivos viven en Cloudinary: acá solo se guarda la URL y el `publicId`
 * (necesario para borrarlos), nunca el binario.
 */
@Entity('post_media')
@Index(['postId', 'order'])
export class PostMedia {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  postId: number;

  @ManyToOne(() => Post, (post) => post.media, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'postId' })
  post: Post;

  @Column({ type: 'varchar', length: 10 })
  type: PostMediaType;

  /** URL https de Cloudinary del archivo original. */
  @Column('text')
  url: string;

  /**
   * `public_id` de Cloudinary. ÚNICO: un mismo archivo no puede quedar
   * colgado de dos publicaciones — si no, borrar una le rompería la otra.
   */
  @Column({ unique: true })
  publicId: string;

  /** Posición dentro de la galería de la publicación (0 = primera). */
  @Column({ type: 'int', default: 0 })
  order: number;

  /** Solo videos: fotograma inicial como imagen, para el `poster` del reproductor. */
  @Column({ type: 'text', nullable: true })
  posterUrl: string | null;

  /**
   * Dimensiones reales del archivo. Permiten reservar el alto correcto del
   * reproductor ANTES de que el video cargue (sin saltos de layout) y saber si
   * es vertical u horizontal. Null en las imágenes migradas de antes.
   */
  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  /** Solo videos: duración en segundos. */
  @Column({ type: 'float', nullable: true })
  duration: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
