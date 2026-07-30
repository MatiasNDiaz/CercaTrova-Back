import { Entity, ManyToOne, PrimaryColumn, JoinColumn } from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { Post } from './post.entity';

/**
 * "Me gusta" de un usuario sobre una publicación.
 *
 * Copia el molde de `Favorite`: PK COMPUESTA (user_id + post_id), que es lo que
 * garantiza a nivel de base que un usuario no pueda likear dos veces la misma
 * publicación aunque lleguen dos requests simultáneos.
 */
@Entity('post_likes')
export class PostLike {
  @PrimaryColumn()
  user_id: number;

  @PrimaryColumn()
  post_id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Post, (post) => post.likes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;
}
