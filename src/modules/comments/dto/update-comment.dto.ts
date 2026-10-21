import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';
import { COMMENT_MAX, Trim } from 'src/common/interaction/interaction.dto';

/**
 * Edición de un comentario propio (solo usuarios logueados). Antes era
 * `PartialType(CreateCommentDto)`; ahora el create trae campos de visitante
 * (`guestName`, honeypot) que no tienen sentido al editar.
 */
export class UpdateCommentDto {
  @IsOptional()
  @IsString()
  @Trim()
  @IsNotEmpty({ message: 'El comentario no puede estar vacío' })
  @MaxLength(COMMENT_MAX, { message: `El comentario puede tener hasta ${COMMENT_MAX} caracteres` })
  message?: string;
}
