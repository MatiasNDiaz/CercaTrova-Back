import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, JoinColumn, Index,
} from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { Post } from './post.entity';

/**
 * Comentario de una publicación.
 *
 * Es AUTO-REFERENCIAL: cuando el admin responde a un comentario se crea otro
 * `PostComment` con `parentComment` apuntando al original. Un comentario raíz
 * tiene `parentComment: null`.
 *
 * `isHidden` es la moderación blanda del admin: el comentario no se borra, se
 * deja de mostrar a los usuarios comunes (el admin lo sigue viendo, marcado).
 */
@Index(['postId'])
@Index(['parentCommentId'])
@Entity('post_comments')
export class PostComment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  content: string;

  @Column({ default: false })
  isHidden: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  postId: number;

  @ManyToOne(() => Post, (post) => post.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'postId' })
  post: Post;

  /** Autor registrado. `null` = comentario de un visitante sin sesión (ver `guestName`). */
  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  /** Nombre que dejó el visitante (opcional). Sin nombre se muestra "Visitante". */
  @Column({ type: 'varchar', length: 50, nullable: true })
  guestName: string | null;

  /** Cookie anónima `ct_vid` y hash de IP — internos, nunca salen (`select: false`). */
  @Column({ type: 'varchar', length: 36, nullable: true, select: false })
  visitorId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  ipHash: string | null;

  /**
   * Comentario al que responde. `null` = comentario raíz.
   * `onDelete: 'CASCADE'` hace que borrar un comentario borre sus respuestas.
   */
  @Column({ type: 'int', nullable: true })
  parentCommentId: number | null;

  @ManyToOne(() => PostComment, (comment) => comment.replies, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'parentCommentId' })
  parentComment: PostComment | null;

  @OneToMany(() => PostComment, (comment) => comment.parentComment)
  replies: PostComment[];
}
