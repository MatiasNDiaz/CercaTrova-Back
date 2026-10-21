import { Entity, ManyToOne, PrimaryGeneratedColumn, Column, JoinColumn, Index } from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { Post } from './post.entity';

/**
 * "Me gusta" sobre una publicación — de un usuario registrado O de un
 * visitante sin sesión.
 *
 * Antes la PK era COMPUESTA (user_id + post_id): garantizaba un like por
 * usuario, pero una PK no admite NULL y los visitantes no tienen `user_id`.
 * Ahora hay un `id` propio y la unicidad la dan dos índices únicos PARCIALES:
 *  - registrado: (user_id, post_id) donde user_id no es NULL;
 *  - visitante:  (visitor_id, post_id) donde user_id es NULL (cookie `ct_vid`).
 * Siguen frenando a nivel base los duplicados por requests simultáneos.
 */
@Index(['user_id', 'post_id'], { unique: true, where: '"user_id" IS NOT NULL' })
@Index(['visitor_id', 'post_id'], { unique: true, where: '"user_id" IS NULL' })
@Index(['post_id'])
@Entity('post_likes')
export class PostLike {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @Column()
  post_id: number;

  /** Cookie anónima `ct_vid` y hash de IP — internos, nunca salen (`select: false`). */
  @Column({ type: 'varchar', length: 36, nullable: true, select: false })
  visitor_id: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  ip_hash: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @ManyToOne(() => Post, (post) => post.likes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;
}
