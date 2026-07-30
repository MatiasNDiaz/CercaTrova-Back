import { IsString, IsNotEmpty, MaxLength, IsOptional, IsEnum } from 'class-validator';

/** Comentario raíz que crea un usuario logueado. */
export class CreatePostCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  content: string;
}

/** Respuesta del admin a un comentario existente. */
export class ReplyPostCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
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
