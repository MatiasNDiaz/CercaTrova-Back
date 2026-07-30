import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PostsService, POST_TTL_DAYS } from './posts.service';

/**
 * Borrado automático de publicaciones vencidas.
 *
 * Las publicaciones son efímeras (duran `POST_TTL_DAYS` días). Este cron corre
 * todos los días a las 3am y limpia las que ya pasaron ese plazo: borra la fila
 * (el CASCADE se lleva likes y comentarios) y la imagen de Cloudinary.
 *
 * Corre a diario y no una vez por semana a propósito: así una publicación vive
 * como mucho ~24hs de más, en vez de hasta 7 días de más si el barrido fuera
 * semanal y hubiera vencido justo después de pasar.
 */
@Injectable()
export class PostsCleanupService {
  private readonly logger = new Logger(PostsCleanupService.name);

  constructor(private readonly postsService: PostsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'posts-cleanup' })
  async handleExpiredPosts() {
    try {
      const { deleted } = await this.postsService.removeExpired();
      if (deleted > 0) {
        this.logger.log(
          `Limpieza de publicaciones: ${deleted} eliminada(s) por superar los ${POST_TTL_DAYS} días.`,
        );
      }
    } catch (error) {
      // Nunca dejar que el cron tire una excepción sin manejar: se loguea y
      // se reintenta en la corrida siguiente.
      this.logger.error(
        'Falló la limpieza automática de publicaciones',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
