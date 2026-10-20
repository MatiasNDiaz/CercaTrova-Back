import { BadRequestException } from '@nestjs/common';
import { PostMediaSlotDto, PostMediaSlotKind } from './dto/create-post.dto';
import { PostMediaType } from './entities/post-media.entity';
import { POST_MEDIA_LIMITS } from './post-media.constants';

/** Un lugar de la galería ya validado. */
export type ResolvedSlot =
  | { kind: PostMediaSlotKind.EXISTING; id: number }
  | { kind: PostMediaSlotKind.IMAGE; index: number }
  | { kind: PostMediaSlotKind.VIDEO; publicId: string };

export interface ResolvedLayout {
  /** La galería final, en orden. */
  slots: ResolvedSlot[];
  /** `public_id` de los videos NUEVOS (los que hay que verificar en Cloudinary). */
  newVideoPublicIds: string[];
  /** Ids de los medios existentes que quedan afuera → se eliminan. */
  removedIds: number[];
}

/**
 * Valida la galería que pide el cliente y la normaliza. Función PURA — sin
 * base ni Cloudinary — para poder testearla sola (`post-media.helper.spec.ts`).
 *
 * Reglas:
 *  - Entre 1 y `maxMediaPerPost` medios; como mucho `maxVideosPerPost` videos
 *    (contando los existentes que se conservan).
 *  - Cada imagen adjunta se usa EXACTAMENTE una vez: una referencia a un
 *    adjunto inexistente es un error, y un adjunto sin referenciar también
 *    (se subiría a Cloudinary y quedaría huérfano).
 *  - Un medio existente solo puede ser de ESTA publicación y aparecer una vez.
 *  - Un mismo video no puede repetirse.
 *
 * @param existing medios actuales de la publicación (`id → tipo`). Vacío al crear.
 */
export function resolveMediaLayout(
  slots: PostMediaSlotDto[],
  uploadedImages: number,
  existing: ReadonlyMap<number, PostMediaType> = new Map(),
): ResolvedLayout {
  if (slots.length === 0) {
    throw new BadRequestException(
      'La publicación necesita al menos una imagen o un video',
    );
  }
  if (slots.length > POST_MEDIA_LIMITS.maxMediaPerPost) {
    throw new BadRequestException(
      `Una publicación admite hasta ${POST_MEDIA_LIMITS.maxMediaPerPost} imágenes y videos en total`,
    );
  }

  const usedImages = new Set<number>();
  const usedExisting = new Set<number>();
  const usedVideos = new Set<string>();
  const resolved: ResolvedSlot[] = [];
  let videoCount = 0;

  for (const slot of slots) {
    switch (slot.kind) {
      case PostMediaSlotKind.IMAGE: {
        const index = slot.index;
        if (
          index === undefined ||
          !Number.isInteger(index) ||
          index < 0 ||
          index >= uploadedImages
        ) {
          throw new BadRequestException(
            'La galería referencia una imagen que no se adjuntó',
          );
        }
        if (usedImages.has(index)) {
          throw new BadRequestException('La galería repite una misma imagen');
        }
        usedImages.add(index);
        resolved.push({ kind: PostMediaSlotKind.IMAGE, index });
        break;
      }

      case PostMediaSlotKind.EXISTING: {
        const id = slot.id;
        const type = id === undefined ? undefined : existing.get(id);
        if (id === undefined || type === undefined) {
          throw new BadRequestException(
            'La galería referencia un medio que no pertenece a esta publicación',
          );
        }
        if (usedExisting.has(id)) {
          throw new BadRequestException('La galería repite un mismo medio');
        }
        usedExisting.add(id);
        if (type === PostMediaType.VIDEO) videoCount++;
        resolved.push({ kind: PostMediaSlotKind.EXISTING, id });
        break;
      }

      case PostMediaSlotKind.VIDEO: {
        const publicId = slot.publicId;
        if (!publicId) {
          throw new BadRequestException('Falta el identificador del video');
        }
        if (usedVideos.has(publicId)) {
          throw new BadRequestException('La galería repite un mismo video');
        }
        usedVideos.add(publicId);
        videoCount++;
        resolved.push({ kind: PostMediaSlotKind.VIDEO, publicId });
        break;
      }

      default:
        throw new BadRequestException('Tipo de medio inválido');
    }
  }

  if (videoCount > POST_MEDIA_LIMITS.maxVideosPerPost) {
    throw new BadRequestException(
      `Una publicación admite hasta ${POST_MEDIA_LIMITS.maxVideosPerPost} videos`,
    );
  }

  if (usedImages.size !== uploadedImages) {
    throw new BadRequestException(
      'Se adjuntaron imágenes que no figuran en la galería',
    );
  }

  const removedIds = [...existing.keys()].filter((id) => !usedExisting.has(id));

  return { slots: resolved, newVideoPublicIds: [...usedVideos], removedIds };
}

/**
 * Archivos de Cloudinary de una publicación, deduplicados, para borrarlos.
 * Incluye el `imagePublicId` legado (anterior a `post_media`) solo si no está
 * ya entre los medios — la migración lo copió ahí, y borrarlo dos veces
 * dejaría un warning de "not found" en cada limpieza.
 */
export function collectPostFiles(post: {
  imagePublicId: string | null;
  media?: { publicId: string; type: PostMediaType }[];
}): { publicId: string; type: PostMediaType }[] {
  const files = new Map<string, PostMediaType>();
  for (const m of post.media ?? []) files.set(m.publicId, m.type);
  if (post.imagePublicId && !files.has(post.imagePublicId)) {
    files.set(post.imagePublicId, PostMediaType.IMAGE);
  }
  return [...files].map(([publicId, type]) => ({ publicId, type }));
}
