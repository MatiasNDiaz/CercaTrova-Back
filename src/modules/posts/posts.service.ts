import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  BadGatewayException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, LessThan, Repository } from 'typeorm';
import { Express } from 'express';
import { Post } from './entities/post.entity';
import { PostLike } from './entities/post-like.entity';
import { PostComment } from './entities/post-comment.entity';
import { User } from '../users/entities/user.entity';
import { CreatePostDto, } from './dto/create-post.dto';
import { PostSortBy } from './dto/post-comment.dto';
import { CloudinaryService } from 'src/common/Cloudinary/cloudinary.service';
import { NotificationService } from '../notifications/notifications.service';
import { Role } from '../users/enums/role.enum';
import { handleServiceError } from 'src/common/helpers/handle-service-error.helper';
import { isUniqueViolation } from 'src/common/helpers/database-error.helper';
import { ensureExists } from 'src/common/helpers/ensure-exists.helper';

type MulterFile = Express.Multer.File;

/** Días que vive una publicación antes de que el cron la borre. */
export const POST_TTL_DAYS = 7;

/** Solo los campos públicos del autor — nunca se filtra el resto del User. */
const USER_PUBLIC_FIELDS = ['id', 'name', 'surname', 'photo', 'role'] as const;

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

    private readonly cloudinary: CloudinaryService,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
  ) {}

  // ---------------------------------------------------------------
  // LISTADO PÚBLICO
  // ---------------------------------------------------------------
  /**
   * `viewerId` (opcional) permite marcar en cada publicación si el usuario que
   * mira ya le dio like, sin que el frontend tenga que pedir los likes aparte.
   */
  async findAll(sortBy: PostSortBy = PostSortBy.RECENT, viewerId?: number) {
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

      const posts = await qb.getMany();
      if (!viewerId || posts.length === 0) {
        return posts.map((p) => ({ ...p, likedByMe: false }));
      }

      const liked = await this.likeRepo.find({
        where: { user_id: viewerId },
        select: ['post_id'],
      });
      const likedIds = new Set(liked.map((l) => l.post_id));

      return posts.map((p) => ({ ...p, likedByMe: likedIds.has(p.id) }));
    } catch (error) {
      handleServiceError(this.logger, error, 'No se pudieron obtener las publicaciones');
    }
  }

  async findOne(id: number, viewerId?: number) {
    const post = await this.postRepo
      .createQueryBuilder('post')
      .leftJoin('post.agent', 'agent')
      .addSelect(USER_PUBLIC_FIELDS.map((f) => `agent.${f}`))
      .where('post.id = :id', { id })
      .getOne();

    if (!post) throw new NotFoundException(`No existe la publicación con ID ${id}`);

    const likedByMe = viewerId
      ? !!(await this.likeRepo.findOneBy({ user_id: viewerId, post_id: id }))
      : false;

    return { ...post, likedByMe };
  }

  // ---------------------------------------------------------------
  // CREAR (ADMIN)
  // ---------------------------------------------------------------
  async create(dto: CreatePostDto, image: MulterFile, agentId: number) {
    if (!image) {
      throw new BadRequestException('La publicación necesita una imagen');
    }

    let uploaded: { secure_url: string; public_id: string };
    try {
      uploaded = await this.cloudinary.uploadImage(image, 'posts');
    } catch (error) {
      // Fallo de servicio externo → 502 con mensaje honesto (patrón del repo).
      this.logger.error(
        'Cloudinary falló al subir la imagen de la publicación',
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadGatewayException('No pudimos procesar la imagen. Intentá de nuevo.');
    }

    try {
      const post = this.postRepo.create({
        description: dto.description,
        imageUrl: uploaded.secure_url,
        imagePublicId: uploaded.public_id,
        agent: { id: agentId } as User,
      });
      const saved = await this.postRepo.save(post);

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
      // Rollback manual: la imagen ya está en Cloudinary pero la fila no se
      // guardó — se limpia para no dejar un huérfano (mismo criterio que
      // `PropertiesService.createWithImages`).
      this.cloudinary
        .deleteFile(uploaded.public_id)
        .catch((e) => this.logger.error('Rollback de imagen incompleto', e));
      handleServiceError(this.logger, error, 'No se pudo crear la publicación');
    }
  }

  // ---------------------------------------------------------------
  // BORRAR (ADMIN)
  // ---------------------------------------------------------------
  async remove(id: number) {
    const post = await ensureExists(this.postRepo, id, 'La publicación');

    // Primero la DB (el CASCADE borra likes y comentarios); la limpieza en
    // Cloudinary es IRREVERSIBLE y va al final, best-effort.
    await this.postRepo.delete(id);

    try {
      await this.cloudinary.deleteFile(post.imagePublicId);
    } catch (error) {
      this.logger.error(
        `No se pudo limpiar en Cloudinary la imagen ${post.imagePublicId} de la publicación ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return { message: `Publicación ${id} eliminada correctamente` };
  }

  // ---------------------------------------------------------------
  // LIKE (toggle)
  // ---------------------------------------------------------------
  /**
   * Transaccional: el borrado/creado del like y el ajuste de `likesCount` tienen
   * que ser atómicos, si no el contador se desincroniza ante requests en
   * paralelo. El `UPDATE ... likesCount + 1` se hace en SQL (no leyendo y
   * escribiendo desde JS) para que sea seguro bajo concurrencia.
   */
  async toggleLike(postId: number, userId: number) {
    await ensureExists(this.postRepo, postId, 'La publicación');

    return this.dataSource.transaction(async (manager) => {
      const likeRepo = manager.getRepository(PostLike);
      const postRepo = manager.getRepository(Post);

      const existing = await likeRepo.findOneBy({ user_id: userId, post_id: postId });

      if (existing) {
        await likeRepo.delete({ user_id: userId, post_id: postId });
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
          await likeRepo.insert({ user_id: userId, post_id: postId });
        } catch (error) {
          // Dos POST simultáneos chocan contra la PK compuesta: el like ya
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
      .leftJoinAndSelect('comment.replies', 'reply')
      .leftJoin('reply.user', 'replyUser')
      .addSelect(USER_PUBLIC_FIELDS.map((f) => `replyUser.${f}`))
      .where('comment.postId = :postId', { postId })
      .andWhere('comment.parentCommentId IS NULL')
      .orderBy('comment.createdAt', 'DESC')
      .addOrderBy('reply.createdAt', 'ASC');

    if (!includeHidden) {
      qb.andWhere('comment.isHidden = false');
      // El join de respuestas es LEFT: esta condición va en el ON, no en el
      // WHERE, para no descartar comentarios que no tengan respuestas.
      qb.andWhere('(reply.id IS NULL OR reply.isHidden = false)');
    }

    return qb.getMany();
  }

  async createComment(postId: number, userId: number, content: string) {
    const post = await ensureExists(this.postRepo, postId, 'La publicación');

    const comment = this.commentRepo.create({
      content,
      postId,
      userId,
      parentCommentId: null,
    });
    const saved = await this.commentRepo.save(comment);
    const withUser = await this.findCommentWithUser(saved.id);

    // Avisar al admin que comentaron su publicación. En background: si el
    // aviso falla, el comentario ya quedó guardado.
    // No se avisa cuando el propio admin comenta su publicación.
    if (withUser?.user?.role !== Role.ADMIN) {
      this.notificationService
        .notifyAdminNewPostComment({
          userName: withUser?.user?.name ?? 'Un usuario',
          postDescription: post?.description ?? '',
          postId,
          commentPreview: content,
          relatedUserId: userId,
        })
        .catch((err) =>
          this.logger.error('Error notificando el comentario al admin', err),
        );
    }

    return withUser;
  }

  /** Respuesta del admin a un comentario existente. */
  async replyComment(parentCommentId: number, userId: number, content: string) {
    const parent = await this.commentRepo.findOneBy({ id: parentCommentId });
    if (!parent) throw new NotFoundException('El comentario no existe');

    // Una respuesta de una respuesta se cuelga del mismo comentario raíz: la UI
    // solo muestra dos niveles.
    const rootId = parent.parentCommentId ?? parent.id;

    const reply = this.commentRepo.create({
      content,
      postId: parent.postId,
      userId,
      parentCommentId: rootId,
    });
    const saved = await this.commentRepo.save(reply);
    const withUser = await this.findCommentWithUser(saved.id);

    // Avisar al autor del comentario respondido — salvo que se responda a sí
    // mismo. En background: si el aviso falla, la respuesta ya se guardó.
    if (parent.userId !== userId) {
      this.notificationService
        .notifyCommentReply({
          commentOwnerId: parent.userId,
          responderName: withUser?.user?.name ?? 'Un usuario',
          responderIsAdmin: withUser?.user?.role === Role.ADMIN,
          replyPreview: content,
          postId: parent.postId,
        })
        .catch((err) => this.logger.error('Error notificando la respuesta', err));
    }

    return withUser;
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
    });

    if (expired.length === 0) return { deleted: 0 };

    // DB primero (CASCADE limpia likes y comentarios), Cloudinary después.
    await this.postRepo.delete(expired.map((p) => p.id));

    for (const post of expired) {
      try {
        await this.cloudinary.deleteFile(post.imagePublicId);
      } catch (error) {
        this.logger.error(
          `No se pudo borrar en Cloudinary la imagen ${post.imagePublicId} de la publicación ${post.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return { deleted: expired.length };
  }
}
