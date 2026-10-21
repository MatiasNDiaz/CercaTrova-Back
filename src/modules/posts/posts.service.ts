import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  BadGatewayException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, In, IsNull, LessThan, Repository, SelectQueryBuilder } from 'typeorm';
import { InteractionActor, displayName } from 'src/common/interaction/interaction-actor';
import { isHoneypotFilled } from 'src/common/interaction/interaction.dto';
import { CreatePostCommentDto, ReplyPostCommentDto } from './dto/post-comment.dto';
import { Express } from 'express';
import { Post } from './entities/post.entity';
import { PostLike } from './entities/post-like.entity';
import { PostComment } from './entities/post-comment.entity';
import { PostMedia, PostMediaType } from './entities/post-media.entity';
import { User } from '../users/entities/user.entity';
import { CreatePostDto, PostMediaSlotKind, UpdatePostDto } from './dto/create-post.dto';
import { PostSortBy } from './dto/post-comment.dto';
import { resolveMediaLayout, collectPostFiles, ResolvedSlot } from './post-media.helper';
import { POST_MEDIA_LIMITS, POST_VIDEO_FOLDER, POST_IMAGE_FOLDER } from './post-media.constants';
import { CloudinaryService } from 'src/common/Cloudinary/cloudinary.service';
import { NotificationService } from '../notifications/notifications.service';
import { Role } from '../users/enums/role.enum';
import { handleServiceError } from 'src/common/helpers/handle-service-error.helper';
import { isUniqueViolation } from 'src/common/helpers/database-error.helper';
import { ensureExists } from 'src/common/helpers/ensure-exists.helper';

type MulterFile = Express.Multer.File;

/** Días que vive una publicación antes de que el cron la borre. */
export const POST_TTL_DAYS = 7;

/**
 * Antigüedad mínima de un video sin publicación para considerarlo huérfano.
 * Holgada a propósito: un admin puede subir un video y tardar en terminar de
 * escribir la publicación; 24hs nunca pisa un formulario en curso.
 */
const ORPHAN_VIDEO_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** Solo los campos públicos del autor — nunca se filtra el resto del User. */
const USER_PUBLIC_FIELDS = ['id', 'name', 'surname', 'photo', 'role'] as const;

/** Un video nuevo ya verificado contra Cloudinary, listo para guardarse. */
interface VerifiedVideo {
  publicId: string;
  url: string;
  posterUrl: string;
  width: number | null;
  height: number | null;
  duration: number | null;
}

/** Quién mira o reacciona: su cuenta, o su cookie de visitante si no hay sesión. */
type Viewer = Pick<InteractionActor, 'userId' | 'visitorId'>;

/**
 * Filtro de "los likes de quien mira": por `user_id` si está logueado, o por
 * `visitor_id` entre las filas ANÓNIMAS si no. `null` si no hay forma de
 * identificarlo (sin sesión ni cookie).
 */
function likeOwner(viewer?: Viewer): FindOptionsWhere<PostLike> | null {
  if (viewer?.userId) return { user_id: viewer.userId };
  if (viewer?.visitorId) return { visitor_id: viewer.visitorId, user_id: IsNull() };
  return null;
}

/** Forma pública de un comentario (y sus respuestas): nombre a mostrar + si es anónimo. */
function toPublicComment<T extends PostComment>(c: T): T & { authorName: string; isAnonymous: boolean } {
  return {
    ...c,
    authorName: displayName(c),
    isAnonymous: c.userId === null,
    ...(c.replies ? { replies: c.replies.map(toPublicComment) } : {}),
  };
}

/** Una imagen nueva ya subida a Cloudinary en este request. */
interface UploadedImage {
  publicId: string;
  url: string;
  width: number | null;
  height: number | null;
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,

    @InjectRepository(PostLike)
    private readonly likeRepo: Repository<PostLike>,

    @InjectRepository(PostComment)
    private readonly commentRepo: Repository<PostComment>,

    @InjectRepository(PostMedia)
    private readonly mediaRepo: Repository<PostMedia>,

    private readonly cloudinary: CloudinaryService,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
  ) {}

  // ---------------------------------------------------------------
  // LISTADO PÚBLICO
  // ---------------------------------------------------------------
  /**
   * `viewer` (opcional) permite marcar en cada publicación si quien mira ya le
   * dio like — por su cuenta si está logueado, o por su cookie de visitante
   * (`ct_vid`) si no — sin que el frontend tenga que pedir los likes aparte.
   */
  async findAll(sortBy: PostSortBy = PostSortBy.RECENT, viewer?: Viewer) {
    try {
      const qb = this.postRepo
        .createQueryBuilder('post')
        .leftJoin('post.agent', 'agent')
        .addSelect(USER_PUBLIC_FIELDS.map((f) => `agent.${f}`))
        // Solo se cuentan los comentarios VISIBLES: un comentario oculto no
        // debe inflar el contador que ve el público.
        .loadRelationCountAndMap(
          'post.commentsCount',
          'post.comments',
          'comment',
          (sub) => sub.where('comment.isHidden = false'),
        );
      this.withMedia(qb);

      switch (sortBy) {
        case PostSortBy.OLDEST:
          qb.orderBy('post.createdAt', 'ASC');
          break;
        case PostSortBy.MOST_LIKED:
          // `likesCount` está desnormalizado justamente para esto.
          qb.orderBy('post.likesCount', 'DESC').addOrderBy('post.createdAt', 'DESC');
          break;
        case PostSortBy.RECENT:
        default:
          qb.orderBy('post.createdAt', 'DESC');
          break;
      }
      // El orden de la galería va DESPUÉS del de las publicaciones: `orderBy`
      // de arriba reemplaza todo orden previo.
      qb.addOrderBy('media.order', 'ASC').addOrderBy('media.id', 'ASC');

      const posts = await qb.getMany();
      const who = likeOwner(viewer);
      if (!who || posts.length === 0) {
        return posts.map((p) => ({ ...p, likedByMe: false }));
      }

      const liked = await this.likeRepo.find({
        where: who,
        select: { id: true, post_id: true },
      });
      const likedIds = new Set(liked.map((l) => l.post_id));

      return posts.map((p) => ({ ...p, likedByMe: likedIds.has(p.id) }));
    } catch (error) {
      handleServiceError(this.logger, error, 'No se pudieron obtener las publicaciones');
    }
  }

  async findOne(id: number, viewer?: Viewer) {
    const qb = this.postRepo
      .createQueryBuilder('post')
      .leftJoin('post.agent', 'agent')
      .addSelect(USER_PUBLIC_FIELDS.map((f) => `agent.${f}`))
      .where('post.id = :id', { id });
    this.withMedia(qb).orderBy('media.order', 'ASC').addOrderBy('media.id', 'ASC');
    const post = await qb.getOne();

    if (!post) throw new NotFoundException(`No existe la publicación con ID ${id}`);

    const who = likeOwner(viewer);
    const likedByMe = who
      ? !!(await this.likeRepo.findOne({ where: { ...who, post_id: id }, select: { id: true } }))
      : false;

    return { ...post, likedByMe };
  }

  /**
   * La publicación con video más reciente, o `null` si no hay ninguna.
   * Para la sección "Cerca-Reels" de la landing.
   *
   * Es "la publicación", no "el video": la sección muestra también su texto,
   * likes y fecha. Como las publicaciones duran `POST_TTL_DAYS`, si no se subió
   * ningún video en esa ventana devuelve `null` y la landing oculta la sección.
   */
  async findLatestWithVideo() {
    const latest = await this.postRepo
      .createQueryBuilder('post')
      .innerJoin('post.media', 'video', 'video.type = :video', { video: PostMediaType.VIDEO })
      .select('post.id', 'id')
      .orderBy('post.createdAt', 'DESC')
      .limit(1)
      .getRawOne<{ id: number }>();

    if (!latest) return { post: null };

    // `findOne` no trae `commentsCount` (solo lo arma el listado). Se cuenta
    // con el mismo criterio que el feed: solo comentarios VISIBLES.
    const [post, commentsCount] = await Promise.all([
      this.findOne(latest.id),
      this.commentRepo.count({ where: { postId: latest.id, isHidden: false } }),
    ]);
    return { post: { ...post, commentsCount } };
  }

  // ---------------------------------------------------------------
  // FIRMA PARA SUBIR VIDEOS (ADMIN)
  // ---------------------------------------------------------------
  /**
   * Firma para que el navegador suba UN video directo a Cloudinary. Devuelve
   * también los límites, para que el formulario valide con los mismos números
   * que después aplica el backend (ver `post-media.constants.ts`).
   */
  getVideoUploadSignature() {
    try {
      return {
        ...this.cloudinary.signVideoUpload(POST_VIDEO_FOLDER, POST_MEDIA_LIMITS.videoFormats),
        limits: POST_MEDIA_LIMITS,
      };
    } catch (error) {
      this.logger.error(
        'No se pudo firmar la subida de video',
        error instanceof Error ? error.stack : String(error),
      );
      // Nunca se devuelve el detalle: podría incluir configuración interna.
      throw new BadGatewayException('No pudimos preparar la subida del video. Intentá de nuevo.');
    }
  }

  // ---------------------------------------------------------------
  // CREAR (ADMIN)
  // ---------------------------------------------------------------
  /**
   * Orden de las operaciones, pensado para no dejar basura si algo falla:
   *  1. Validar la galería (puro, sin efectos).
   *  2. Verificar los videos en Cloudinary (solo lectura).
   *  3. Subir las imágenes. Si una falla, se borran las ya subidas.
   *  4. Guardar publicación + medios en UNA transacción. Si falla, se borran
   *     las imágenes subidas en el paso 3. Los videos NO se borran: los subió
   *     el admin desde el formulario y puede reintentar con ellos; si no lo
   *     hace, el barrido diario de huérfanos los limpia.
   */
  async create(dto: CreatePostDto, files: MulterFile[], agentId: number) {
    const slots = dto.media ?? files.map((_, index) => ({ kind: PostMediaSlotKind.IMAGE, index }));
    const layout = resolveMediaLayout(slots, files.length);

    const videos = await this.verifyNewVideos(layout.newVideoPublicIds);
    const images = await this.uploadImages(files);

    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const post = await manager.getRepository(Post).save(
          manager.getRepository(Post).create({
            description: dto.description,
            imageUrl: this.coverUrl(layout.slots, images, videos, new Map()),
            imagePublicId: null,
            agent: { id: agentId } as User,
          }),
        );
        await manager.getRepository(PostMedia).save(
          this.buildNewMediaRows(post.id, layout.slots, images, videos),
        );
        return post;
      });

      // Aviso a todos los usuarios (in-app + email), en background: si falla,
      // la publicación ya quedó creada.
      this.notificationService
        .handleNewPost({
          id: saved.id,
          description: saved.description,
          imageUrl: saved.imageUrl,
        })
        .catch((err) => this.logger.error('Error notificando la nueva publicación', err));

      return this.findOne(saved.id);
    } catch (error) {
      // Rollback manual de lo que ESTE request subió (mismo criterio que
      // `PropertiesService.createWithImages`).
      this.discardUploadedImages(images);
      handleServiceError(this.logger, error, 'No se pudo crear la publicación');
    }
  }

  // ---------------------------------------------------------------
  // EDITAR (ADMIN)
  // ---------------------------------------------------------------
  /**
   * `dto.media` es la galería FINAL completa. Los medios existentes que no
   * figuran se eliminan; los que figuran se reordenan; los nuevos se agregan.
   *
   * Los archivos de los medios eliminados se borran de Cloudinary recién
   * DESPUÉS de confirmar la transacción: si la base falla, la publicación
   * queda exactamente como estaba y no se perdió ningún archivo.
   */
  async update(id: number, dto: UpdatePostDto, files: MulterFile[]) {
    const post = await this.postRepo.findOne({ where: { id }, relations: { media: true } });
    if (!post) throw new NotFoundException(`No existe la publicación con ID ${id}`);

    const existing = new Map(post.media.map((m) => [m.id, m.type]));
    const layout = resolveMediaLayout(dto.media, files.length, existing);

    const videos = await this.verifyNewVideos(layout.newVideoPublicIds);
    const images = await this.uploadImages(files);

    const byId = new Map(post.media.map((m) => [m.id, m]));
    // `removedIds` sale de las claves de `existing`, que se armó con este mismo
    // `post.media`: el `get` siempre encuentra el medio.
    const removed = layout.removedIds.map((mid) => byId.get(mid));

    try {
      await this.dataSource.transaction(async (manager) => {
        const mediaRepo = manager.getRepository(PostMedia);

        if (removed.length > 0) {
          await mediaRepo.delete({ id: In(removed.map((m) => m.id)), postId: id });
        }

        // Reordenar los que se conservan.
        for (const [position, slot] of layout.slots.entries()) {
          if (slot.kind === PostMediaSlotKind.EXISTING) {
            await mediaRepo.update({ id: slot.id, postId: id }, { order: position });
          }
        }

        await mediaRepo.save(this.buildNewMediaRows(id, layout.slots, images, videos));

        // Si se eliminó la imagen legada (la de antes de `post_media`), la
        // columna deja de apuntar a un archivo que ya no es de la publicación.
        const legacyRemoved = removed.some((m) => m.publicId === post.imagePublicId);

        await manager.getRepository(Post).update(id, {
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          imageUrl: this.coverUrl(layout.slots, images, videos, byId),
          ...(legacyRemoved ? { imagePublicId: null } : {}),
        });
      });
    } catch (error) {
      this.discardUploadedImages(images);
      handleServiceError(this.logger, error, 'No se pudo actualizar la publicación');
    }

    // Ya confirmado en la base: recién ahora se borran los archivos quitados.
    await this.deleteRemoteFiles(removed, `publicación ${id}`);

    return this.findOne(id);
  }

  // ---------------------------------------------------------------
  // BORRAR (ADMIN)
  // ---------------------------------------------------------------
  async remove(id: number) {
    const post = await this.postRepo.findOne({ where: { id }, relations: { media: true } });
    if (!post) throw new NotFoundException(`La publicación con ID ${id} no existe`);

    // Primero la DB (el CASCADE borra likes, comentarios y medios); la
    // limpieza en Cloudinary es IRREVERSIBLE y va al final, best-effort.
    await this.postRepo.delete(id);
    await this.deleteRemoteFiles(collectPostFiles(post), `publicación ${id}`);

    return { message: `Publicación ${id} eliminada correctamente` };
  }

  // ---------------------------------------------------------------
  // MEDIOS — helpers internos
  // ---------------------------------------------------------------
  /** Suma los medios (ordenados por quien llama) a una consulta de publicaciones. */
  private withMedia(qb: SelectQueryBuilder<Post>) {
    return qb.leftJoinAndSelect('post.media', 'media');
  }

  /**
   * Comprueba en Cloudinary cada video NUEVO antes de asociarlo. Es lo que
   * impide que el cliente cuelgue de una publicación un recurso cualquiera:
   *  - tiene que existir como video;
   *  - dentro de la carpeta de videos de publicaciones (la que fija la firma);
   *  - con formato y peso permitidos;
   *  - y no estar ya usado por otra publicación.
   *
   * Un video que existe en nuestra carpeta pero excede el peso se borra al
   * rechazarlo: lo subió el admin y no sirve para nada. Uno que ya pertenece a
   * otra publicación NUNCA se toca.
   */
  private async verifyNewVideos(publicIds: string[]): Promise<Map<string, VerifiedVideo>> {
    const verified = new Map<string, VerifiedVideo>();
    if (publicIds.length === 0) return verified;

    const alreadyUsed = await this.mediaRepo.find({
      where: { publicId: In(publicIds) },
      select: { id: true, publicId: true },
    });
    if (alreadyUsed.length > 0) {
      throw new BadRequestException('Uno de los videos ya pertenece a otra publicación');
    }

    for (const publicId of publicIds) {
      let resource: Awaited<ReturnType<CloudinaryService['getVideoResource']>>;
      try {
        resource = await this.cloudinary.getVideoResource(publicId);
      } catch (error) {
        this.logger.error(
          `Cloudinary no respondió al verificar el video ${publicId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw new BadGatewayException('No pudimos verificar el video. Intentá de nuevo.');
      }

      if (!resource) {
        throw new BadRequestException('Uno de los videos no existe o no terminó de subirse');
      }

      const inFolder =
        resource.publicId.startsWith(`${POST_VIDEO_FOLDER}/`) ||
        resource.assetFolder === POST_VIDEO_FOLDER;
      if (!inFolder) {
        throw new BadRequestException('Uno de los videos no se subió desde el formulario de publicaciones');
      }

      const formatOk = (POST_MEDIA_LIMITS.videoFormats as readonly string[]).includes(resource.format);
      const sizeOk = resource.bytes > 0 && resource.bytes <= POST_MEDIA_LIMITS.maxVideoBytes;
      if (!formatOk || !sizeOk) {
        this.cloudinary
          .deleteFile(publicId, 'video')
          .catch((e) => this.logger.error(`No se pudo descartar el video inválido ${publicId}`, e));
        throw new BadRequestException(
          !formatOk
            ? 'Formato de video no permitido. Usá MP4 o WebM.'
            : `El video supera el máximo de ${POST_MEDIA_LIMITS.maxVideoBytes / (1024 * 1024)} MB`,
        );
      }

      verified.set(publicId, {
        publicId,
        url: resource.secureUrl,
        posterUrl: this.cloudinary.videoPosterUrl(publicId),
        width: resource.width,
        height: resource.height,
        duration: resource.duration,
      });
    }

    return verified;
  }

  /**
   * Sube las imágenes del request. Si una falla, borra las que ya habían
   * subido y responde 502 — no queda ningún archivo suelto.
   */
  private async uploadImages(files: MulterFile[]): Promise<UploadedImage[]> {
    const uploaded: UploadedImage[] = [];
    try {
      for (const file of files) {
        const r = await this.cloudinary.uploadImage(file, POST_IMAGE_FOLDER);
        uploaded.push({
          publicId: r.public_id,
          url: r.secure_url,
          width: typeof r.width === 'number' ? r.width : null,
          height: typeof r.height === 'number' ? r.height : null,
        });
      }
      return uploaded;
    } catch (error) {
      this.discardUploadedImages(uploaded);
      // Fallo de servicio externo → 502 con mensaje honesto (patrón del repo).
      this.logger.error(
        'Cloudinary falló al subir una imagen de la publicación',
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadGatewayException('No pudimos procesar las imágenes. Intentá de nuevo.');
    }
  }

  /** Rollback best-effort de imágenes subidas en un request que no prosperó. */
  private discardUploadedImages(images: UploadedImage[]) {
    for (const img of images) {
      this.cloudinary
        .deleteFile(img.publicId, 'image')
        .catch((e) => this.logger.error(`Rollback de imagen incompleto (${img.publicId})`, e));
    }
  }

  /** Filas nuevas de `post_media` para los lugares de imagen/video nuevos. */
  private buildNewMediaRows(
    postId: number,
    slots: ResolvedSlot[],
    images: UploadedImage[],
    videos: Map<string, VerifiedVideo>,
  ): Partial<PostMedia>[] {
    const rows: Partial<PostMedia>[] = [];
    slots.forEach((slot, order) => {
      if (slot.kind === PostMediaSlotKind.IMAGE) {
        const img = images[slot.index];
        rows.push({
          postId, order, type: PostMediaType.IMAGE,
          url: img.url, publicId: img.publicId,
          width: img.width, height: img.height,
          posterUrl: null, duration: null,
        });
      } else if (slot.kind === PostMediaSlotKind.VIDEO) {
        // `verifyNewVideos` recibió exactamente estos `publicId`.
        const v = videos.get(slot.publicId);
        rows.push({
          postId, order, type: PostMediaType.VIDEO,
          url: v.url, publicId: v.publicId,
          width: v.width, height: v.height,
          posterUrl: v.posterUrl, duration: v.duration,
        });
      }
    });
    return rows;
  }

  /** URL de portada: el primer medio de la galería (el poster si es video). */
  private coverUrl(
    slots: ResolvedSlot[],
    images: UploadedImage[],
    videos: Map<string, VerifiedVideo>,
    existing: Map<number, PostMedia>,
  ): string {
    const first = slots[0];
    switch (first.kind) {
      case PostMediaSlotKind.IMAGE:
        return images[first.index].url;
      case PostMediaSlotKind.VIDEO:
        return videos.get(first.publicId).posterUrl;
      case PostMediaSlotKind.EXISTING: {
        const m = existing.get(first.id);
        return m.type === PostMediaType.VIDEO ? (m.posterUrl ?? m.url) : m.url;
      }
    }
  }

  /**
   * Borra archivos de Cloudinary, best-effort: se llama DESPUÉS de que la
   * base ya confirmó, así que un fallo acá solo deja un archivo suelto (que se
   * loguea), nunca una publicación rota.
   */
  private async deleteRemoteFiles(
    files: { publicId: string; type: PostMediaType }[],
    context: string,
  ) {
    for (const f of files) {
      try {
        await this.cloudinary.deleteFile(f.publicId, f.type === PostMediaType.VIDEO ? 'video' : 'image');
      } catch (error) {
        this.logger.error(
          `No se pudo limpiar en Cloudinary ${f.publicId} (${context})`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  // ---------------------------------------------------------------
  // LIKE (toggle)
  // ---------------------------------------------------------------
  /**
   * Transaccional: el borrado/creado del like y el ajuste de `likesCount` tienen
   * que ser atómicos, si no el contador se desincroniza ante requests en
   * paralelo. El `UPDATE ... likesCount + 1` se hace en SQL (no leyendo y
   * escribiendo desde JS) para que sea seguro bajo concurrencia.
   *
   * Abierto a visitantes sin sesión: el like se ata a su cookie `ct_vid`.
   * Sin sesión NI cookie no hay forma de evitar duplicados → 400.
   */
  async toggleLike(postId: number, actor: InteractionActor) {
    const who = likeOwner(actor);
    if (!who) {
      throw new BadRequestException(
        'No pudimos identificar tu navegador para guardar el "me gusta". Revisá que las cookies estén habilitadas.',
      );
    }
    await ensureExists(this.postRepo, postId, 'La publicación');

    return this.dataSource.transaction(async (manager) => {
      const likeRepo = manager.getRepository(PostLike);
      const postRepo = manager.getRepository(Post);

      const existing = await likeRepo.findOne({ where: { ...who, post_id: postId }, select: { id: true } });

      if (existing) {
        await likeRepo.delete({ id: existing.id });
        // GREATEST(...) evita que el contador se vaya a negativo si alguna vez
        // quedó desincronizado.
        await postRepo
          .createQueryBuilder()
          .update(Post)
          .set({ likesCount: () => 'GREATEST("likesCount" - 1, 0)' })
          .where('id = :postId', { postId })
          .execute();
      } else {
        try {
          await likeRepo.insert({
            user_id: actor.userId,
            visitor_id: actor.userId ? null : actor.visitorId,
            ip_hash: actor.ipHash,
            post_id: postId,
          });
        } catch (error) {
          // Dos POST simultáneos chocan contra el índice único: el like ya
          // existe, así que no hay nada que hacer (y no se toca el contador).
          if (isUniqueViolation(error)) {
            const fresh = await postRepo.findOneBy({ id: postId });
            return { liked: true, likesCount: fresh?.likesCount ?? 0 };
          }
          throw error;
        }
        await postRepo
          .createQueryBuilder()
          .update(Post)
          .set({ likesCount: () => '"likesCount" + 1' })
          .where('id = :postId', { postId })
          .execute();
      }

      const updated = await postRepo.findOneBy({ id: postId });
      return { liked: !existing, likesCount: updated?.likesCount ?? 0 };
    });
  }

  // ---------------------------------------------------------------
  // COMENTARIOS
  // ---------------------------------------------------------------
  /**
   * Devuelve los comentarios RAÍZ con sus respuestas anidadas.
   * `includeHidden` solo lo manda el admin: para el público, un comentario
   * oculto (y sus respuestas) no existe.
   */
  async findComments(postId: number, includeHidden = false) {
    await ensureExists(this.postRepo, postId, 'La publicación');

    const qb = this.commentRepo
      .createQueryBuilder('comment')
      .leftJoin('comment.user', 'user')
      .addSelect(USER_PUBLIC_FIELDS.map((f) => `user.${f}`))
      // 🐛 FIX: el filtro de respuestas ocultas va en el ON del LEFT JOIN, NO
      // en el WHERE. Antes estaba como `andWhere('(reply.id IS NULL OR
      // reply.isHidden = false)')` y eso descartaba la fila entera cuando un
      // comentario raíz tenía respuestas y TODAS estaban ocultas: no quedaba
      // ninguna fila que cumpliera la condición, así que el comentario PADRE
      // —visible y legítimo— desaparecía del listado público. Con la condición
      // en el ON, las respuestas ocultas simplemente no se adjuntan y el
      // comentario raíz se devuelve igual, con `replies: []`.
      .leftJoinAndSelect(
        'comment.replies',
        'reply',
        includeHidden ? undefined : 'reply.isHidden = false',
      )
      .leftJoin('reply.user', 'replyUser')
      .addSelect(USER_PUBLIC_FIELDS.map((f) => `replyUser.${f}`))
      .where('comment.postId = :postId', { postId })
      .andWhere('comment.parentCommentId IS NULL')
      .orderBy('comment.createdAt', 'DESC')
      .addOrderBy('reply.createdAt', 'ASC');

    if (!includeHidden) {
      qb.andWhere('comment.isHidden = false');
    }

    return (await qb.getMany()).map(toPublicComment);
  }

  /**
   * Comentario raíz — de un usuario logueado (asociado a su cuenta, como
   * siempre) o de un VISITANTE sin sesión (`userId: null` + nombre opcional).
   */
  async createComment(postId: number, actor: InteractionActor, dto: CreatePostCommentDto) {
    const post = await ensureExists(this.postRepo, postId, 'La publicación');
    const guestName = actor.userId ? null : dto.guestName?.trim() || null;

    // Honeypot completo = bot: respuesta "exitosa" sin guardar nada.
    if (isHoneypotFilled(dto)) return this.fakeComment(postId, dto.content, guestName, null);

    const saved = await this.commentRepo.save(
      this.commentRepo.create({
        content: dto.content,
        postId,
        userId: actor.userId,
        guestName,
        visitorId: actor.visitorId,
        ipHash: actor.ipHash,
        parentCommentId: null,
      }),
    );
    const withUser = await this.findCommentWithUser(saved.id);

    // Avisar al admin que comentaron su publicación. En background: si el
    // aviso falla, el comentario ya quedó guardado.
    // No se avisa cuando el propio admin comenta su publicación.
    if (withUser?.user?.role !== Role.ADMIN) {
      this.notificationService
        .notifyAdminNewPostComment({
          userName: withUser?.user?.name ?? (guestName ? `${guestName} (visitante)` : 'Un visitante'),
          postDescription: post?.description ?? '',
          postId,
          commentPreview: dto.content,
          relatedUserId: actor.userId ?? null,
        })
        .catch((err) =>
          this.logger.error('Error notificando el comentario al admin', err),
        );
    }

    return withUser ? toPublicComment(withUser) : null;
  }

  /** Respuesta a un comentario existente — usuarios logueados y visitantes. */
  async replyComment(parentCommentId: number, actor: InteractionActor, dto: ReplyPostCommentDto) {
    const parent = await this.commentRepo.findOneBy({ id: parentCommentId });
    if (!parent) throw new NotFoundException('El comentario no existe');

    // Una respuesta de una respuesta se cuelga del mismo comentario raíz: la UI
    // solo muestra dos niveles.
    const rootId = parent.parentCommentId ?? parent.id;
    const guestName = actor.userId ? null : dto.guestName?.trim() || null;

    if (isHoneypotFilled(dto)) return this.fakeComment(parent.postId, dto.content, guestName, rootId);

    const saved = await this.commentRepo.save(
      this.commentRepo.create({
        content: dto.content,
        postId: parent.postId,
        userId: actor.userId,
        guestName,
        visitorId: actor.visitorId,
        ipHash: actor.ipHash,
        parentCommentId: rootId,
      }),
    );
    const withUser = await this.findCommentWithUser(saved.id);

    // Avisar al autor del comentario respondido — solo si es un usuario
    // registrado (a un visitante no hay a quién avisarle) y no se responde a
    // sí mismo. En background: si el aviso falla, la respuesta ya se guardó.
    if (parent.userId !== null && parent.userId !== actor.userId) {
      this.notificationService
        .notifyCommentReply({
          commentOwnerId: parent.userId,
          responderName: withUser?.user?.name ?? (guestName ? `${guestName} (visitante)` : 'Un visitante'),
          responderIsAdmin: withUser?.user?.role === Role.ADMIN,
          replyPreview: dto.content,
          postId: parent.postId,
        })
        .catch((err) => this.logger.error('Error notificando la respuesta', err));
    }

    return withUser ? toPublicComment(withUser) : null;
  }

  /** Respuesta de un comentario "guardado" para un bot (honeypot): no existe en la base. */
  private fakeComment(postId: number, content: string, guestName: string | null, parentCommentId: number | null) {
    return toPublicComment(
      this.commentRepo.create({
        id: 0, content, postId, userId: null, guestName, parentCommentId,
        isHidden: false, createdAt: new Date(), user: null,
      }),
    );
  }

  async toggleHideComment(commentId: number) {
    const comment = await this.commentRepo.findOneBy({ id: commentId });
    if (!comment) throw new NotFoundException('El comentario no existe');

    comment.isHidden = !comment.isHidden;
    await this.commentRepo.save(comment);

    return {
      id: comment.id,
      isHidden: comment.isHidden,
      message: comment.isHidden ? 'Comentario ocultado' : 'Comentario visible de nuevo',
    };
  }

  async removeComment(commentId: number) {
    const comment = await this.commentRepo.findOneBy({ id: commentId });
    if (!comment) throw new NotFoundException('El comentario no existe');

    // El CASCADE de `parentComment` borra las respuestas.
    await this.commentRepo.delete(commentId);
    return { message: 'Comentario eliminado correctamente' };
  }

  private async findCommentWithUser(commentId: number) {
    return this.commentRepo
      .createQueryBuilder('comment')
      .leftJoin('comment.user', 'user')
      .addSelect(USER_PUBLIC_FIELDS.map((f) => `user.${f}`))
      .where('comment.id = :commentId', { commentId })
      .getOne();
  }

  // ---------------------------------------------------------------
  // LIMPIEZA AUTOMÁTICA (la usa el cron)
  // ---------------------------------------------------------------
  /**
   * Borra las publicaciones con más de `POST_TTL_DAYS` días.
   * Devuelve cuántas borró — el cron lo loguea y los tests lo verifican.
   */
  async removeExpired(): Promise<{ deleted: number }> {
    const cutoff = new Date(Date.now() - POST_TTL_DAYS * 24 * 60 * 60 * 1000);

    const expired = await this.postRepo.find({
      where: { createdAt: LessThan(cutoff) },
      relations: { media: true },
    });

    if (expired.length === 0) return { deleted: 0 };

    // DB primero (CASCADE limpia likes, comentarios y medios), Cloudinary después.
    await this.postRepo.delete(expired.map((p) => p.id));

    for (const post of expired) {
      await this.deleteRemoteFiles(collectPostFiles(post), `publicación vencida ${post.id}`);
    }

    return { deleted: expired.length };
  }

  /**
   * Borra de Cloudinary los videos de publicaciones que no quedaron asociados
   * a ninguna (subidos desde el formulario, pero la publicación nunca se
   * guardó). Solo los de más de `ORPHAN_VIDEO_MIN_AGE_MS`, para no pisar a un
   * admin que está terminando de escribir.
   *
   * ⚠️ SOLO EN PRODUCCIÓN, a propósito. El backend local usa la MISMA cuenta
   * de Cloudinary pero OTRA base de datos: corriendo en desarrollo, todos los
   * videos de producción le parecerían huérfanos (no están en la base local) y
   * los borraría.
   */
  async sweepOrphanVideos(): Promise<{ deleted: number }> {
    if (process.env.NODE_ENV !== 'production') return { deleted: 0 };

    const olderThan = new Date(Date.now() - ORPHAN_VIDEO_MIN_AGE_MS);
    const candidates = await this.cloudinary.listVideosOlderThan(`${POST_VIDEO_FOLDER}/`, olderThan);
    if (candidates.length === 0) return { deleted: 0 };

    const referenced = await this.mediaRepo.find({
      where: { publicId: In(candidates) },
      select: { id: true, publicId: true },
    });
    const keep = new Set(referenced.map((m) => m.publicId));
    const orphans = candidates.filter((id) => !keep.has(id));

    await this.deleteRemoteFiles(
      orphans.map((publicId) => ({ publicId, type: PostMediaType.VIDEO })),
      'video huérfano',
    );
    return { deleted: orphans.length };
  }
}
