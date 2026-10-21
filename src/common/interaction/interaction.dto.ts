import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** Recorta espacios en strings (un comentario de solo espacios queda vacío y lo rechaza `@IsNotEmpty`). */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** Largo máximo de un comentario (propiedades y publicaciones). */
export const COMMENT_MAX = 1000;

/**
 * Campos que se suman a todo comentario público:
 *  - `guestName`: nombre opcional del visitante sin sesión (≤50). Si hay
 *    sesión se ignora y se usa el nombre de la cuenta.
 *  - `website`: HONEYPOT anti-bots. El formulario lo tiene oculto, así que una
 *    persona nunca lo completa; si llega con algo, el backend descarta el
 *    comentario en silencio (responde como si lo hubiera guardado).
 */
export class GuestCommentFields {
  @IsOptional()
  @IsString()
  @Trim()
  @MaxLength(50, { message: 'El nombre puede tener hasta 50 caracteres' })
  guestName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;
}

/** `true` si el honeypot vino completo (petición de un bot). */
export const isHoneypotFilled = (dto: { website?: string }) =>
  typeof dto.website === 'string' && dto.website.trim().length > 0;
