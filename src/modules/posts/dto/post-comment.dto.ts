import { IsString, IsNotEmpty, MaxLength, IsOptional, IsEnum } from 'class-validator';
import { COMMENT_MAX, GuestCommentFields, Trim } from 'src/common/interaction/interaction.dto';

/** Comentario raíz — de un usuario logueado o de un visitante sin sesión. */
export class CreatePostCommentDto extends GuestCommentFields {
  @IsString()
  @Trim()
  @IsNotEmpty({ message: 'El comentario no puede estar vacío' })
  @MaxLength(COMMENT_MAX, { message: `El comentario puede tener hasta ${COMMENT_MAX} caracteres` })
  content: string;
}

/** Respuesta a un comentario existente — también abierta a visitantes. */
export class ReplyPostCommentDto extends GuestCommentFields {
  @IsString()
  @Trim()
  @IsNotEmpty({ message: 'La respuesta no puede estar vacía' })
  @MaxLength(COMMENT_MAX, { message: `La respuesta puede tener hasta ${COMMENT_MAX} caracteres` })
  content: string;
}

/** Criterios de orden del feed público. */
export enum PostSortBy {
  RECENT = 'recent',
  OLDEST = 'oldest',
  MOST_LIKED = 'mostLiked',
}

export class FindPostsDto {
  @IsOptional()
  @IsEnum(PostSortBy, {
    message: `sortBy inválido. Valores permitidos: ${Object.values(PostSortBy).join(', ')}`,
  })
  sortBy?: PostSortBy;
}
