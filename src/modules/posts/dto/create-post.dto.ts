import {
  IsString, IsNotEmpty, MaxLength, IsOptional, IsArray, ArrayMaxSize, ArrayMinSize,
  ValidateNested, IsEnum, IsInt, Min, Matches, ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { POST_MEDIA_LIMITS } from '../post-media.constants';

/** Qué ocupa cada lugar de la galería de una publicación. */
export enum PostMediaSlotKind {
  /** Un medio que la publicación YA tiene (solo al editar). */
  EXISTING = 'existing',
  /** Una imagen NUEVA que viaja como archivo en este mismo request. */
  IMAGE = 'image',
  /** Un video ya subido directo a Cloudinary con una firma del backend. */
  VIDEO = 'video',
}

/**
 * Un lugar de la galería, en orden. La lista completa describe el resultado
 * final: qué medios tiene la publicación y en qué posición.
 *
 * ⚠️ Lo que diga acá el cliente se VERIFICA, no se cree:
 *  - `index` tiene que apuntar a un archivo realmente adjunto;
 *  - `id` tiene que ser un medio de ESTA publicación;
 *  - `publicId` tiene que existir en Cloudinary, dentro de la carpeta de
 *    videos de publicaciones, con formato y peso permitidos, y no estar ya
 *    usado por otra publicación.
 * Ver `resolveMediaLayout` y `PostsService.verifyNewVideos`.
 */
export class PostMediaSlotDto {
  @IsEnum(PostMediaSlotKind)
  kind: PostMediaSlotKind;

  @ValidateIf((o: PostMediaSlotDto) => o.kind === PostMediaSlotKind.EXISTING)
  @IsInt()
  @Min(1)
  id?: number;

  /** Posición del archivo dentro de los adjuntos `images` del request. */
  @ValidateIf((o: PostMediaSlotDto) => o.kind === PostMediaSlotKind.IMAGE)
  @IsInt()
  @Min(0)
  index?: number;

  /** Caracteres seguros solamente: nada de `..`, espacios ni URLs. */
  @ValidateIf((o: PostMediaSlotDto) => o.kind === PostMediaSlotKind.VIDEO)
  @IsString()
  @MaxLength(255)
  @Matches(/^[A-Za-z0-9_\-/]+$/, { message: 'Identificador de video inválido' })
  publicId?: string;
}

/**
 * Los ARCHIVOS de imagen no van acá: viajan como multipart por
 * `FileFieldsInterceptor`, igual que en `properties.controller.ts`. Este DTO
 * lleva el texto y, opcionalmente, el orden de la galería.
 *
 * `media` es opcional por compatibilidad: un cliente que manda solo
 * `{ description }` + un archivo en `image` (el formulario anterior) sigue
 * funcionando — se arma la galería con las imágenes adjuntas, en orden.
 */
export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'La publicación necesita al menos una imagen o un video' })
  @ArrayMaxSize(POST_MEDIA_LIMITS.maxMediaPerPost, {
    message: `Una publicación admite hasta ${POST_MEDIA_LIMITS.maxMediaPerPost} imágenes y videos en total`,
  })
  @ValidateNested({ each: true })
  @Type(() => PostMediaSlotDto)
  media?: PostMediaSlotDto[];
}

/**
 * Edición. `media` es OBLIGATORIO y es la galería final completa: un medio
 * existente que no aparezca en la lista se elimina (de la base y de
 * Cloudinary). Así quitar uno no puede borrar los demás por accidente — solo
 * se va lo que el formulario dejó de listar explícitamente.
 */
export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'La publicación necesita al menos una imagen o un video' })
  @ArrayMaxSize(POST_MEDIA_LIMITS.maxMediaPerPost, {
    message: `Una publicación admite hasta ${POST_MEDIA_LIMITS.maxMediaPerPost} imágenes y videos en total`,
  })
  @ValidateNested({ each: true })
  @Type(() => PostMediaSlotDto)
  media: PostMediaSlotDto[];
}
