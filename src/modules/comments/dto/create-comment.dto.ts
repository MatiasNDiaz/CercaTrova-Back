import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { COMMENT_MAX, GuestCommentFields, Trim } from 'src/common/interaction/interaction.dto';

/**
 * Comentario en una propiedad — de un usuario logueado o de un visitante.
 * `guestName` (opcional) y `website` (honeypot) vienen de `GuestCommentFields`.
 */
export class CreateCommentDto extends GuestCommentFields {
  @IsString()
  @Trim()
  @IsNotEmpty({ message: 'El comentario no puede estar vacío' })
  @MaxLength(COMMENT_MAX, { message: `El comentario puede tener hasta ${COMMENT_MAX} caracteres` })
  message: string;
}
