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

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

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
