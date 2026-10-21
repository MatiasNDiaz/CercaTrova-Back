import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Rating } from './entities/rating.entity';
import { Property } from '../properties/entities/property.entity';
import { IsNull, Not, In, Repository } from 'typeorm';
import { NotificationService } from '../notifications/notifications.service'; // 👈
import { isUniqueViolation } from 'src/common/helpers/database-error.helper';
import { InteractionActor } from 'src/common/interaction/interaction-actor';
import { Role } from '../users/enums/role.enum';
import { User } from '../users/entities/user.entity';
import { StatusProperty } from '../properties/dto/enumsStatusProperty';

/** Estados en los que una propiedad NO acepta calificaciones (no es pública). */
const NOT_PUBLIC = [StatusProperty.ELIMINADO, StatusProperty.PAUSADO];

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(Rating)
    private readonly ratingRepo: Repository<Rating>,

    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,

    private readonly notificationService: NotificationService, // 👈
  ) {}

  /**
   * Califica una propiedad (1..5) — usuario logueado o VISITANTE sin sesión.
   *
   * UNA calificación por usuario (o por visitante, vía la cookie `ct_vid`) y
   * propiedad: volver a calificar ACTUALIZA la anterior, no crea otra.
   *
   * El admin sigue sin poder calificar: él publica, no puntúa (regla previa).
   */
  async rateProperty(actor: InteractionActor, propertyId: number, score: number) {
    if (!Number.isInteger(score) || score < 1 || score > 5)
      throw new BadRequestException('El puntaje debe ser entre 1 y 5');
    if (actor.role === Role.ADMIN)
      throw new ForbiddenException('El administrador no puede calificar propiedades');
    if (!actor.userId && !actor.visitorId)
      throw new BadRequestException(
        'No pudimos identificar tu navegador para guardar la calificación. Revisá que las cookies estén habilitadas.',
      );

    const property = await this.propertyRepo.findOne({
      where: { id: propertyId, status: Not(In(NOT_PUBLIC)) },
      select: { id: true, title: true },
    });
    if (!property) throw new NotFoundException('La propiedad indicada no existe');

    // Clave de "quién": su cuenta, o su cookie si es anónimo.
    const mine = actor.userId
      ? { userId: actor.userId, propertyId }
      : { visitorId: actor.visitorId, userId: IsNull(), propertyId };

    let saved: Rating;
    const existing = await this.ratingRepo.findOne({ where: mine });
    if (existing) {
      existing.score = score;
      saved = await this.ratingRepo.save(existing);
    } else {
      try {
        saved = await this.ratingRepo.save(
          this.ratingRepo.create({
            score,
            userId: actor.userId,
            propertyId,
            visitorId: actor.userId ? null : actor.visitorId,
            ipHash: actor.ipHash,
          }),
        );
      } catch (error) {
        // Dos requests simultáneos del mismo usuario/visitante chocan contra el
        // índice único: la otra ya creó la fila, así que se actualiza esa.
        if (!isUniqueViolation(error)) throw error;
        const winner = await this.ratingRepo.findOne({ where: mine });
        if (!winner) throw error;
        winner.score = score;
        saved = await this.ratingRepo.save(winner);
      }
    }

    // 👇 Notificar al admin — no bloqueante
    const user = actor.userId
      ? await this.ratingRepo.manager.findOne(User, { where: { id: actor.userId }, select: { id: true, name: true } })
      : null;
    this.notificationService
      .notifyAdminNewRating({
        userName: user?.name ?? 'Un visitante',
        propertyTitle: property.title,
        propertyId,
        score,
        relatedUserId: user?.id ?? null, // 👈
      })
      .catch((err) => console.error('[NOTIF ADMIN] Error en valoración:', err));

    return { id: saved.id, score: saved.score, propertyId, userId: saved.userId };
  }

  async getPropertyAverage(propertyId: number) {
    const ratings = await this.ratingRepo.find({
      where: { property: { id: propertyId } },
    });

    if (!ratings.length) return 0;

    const sum = ratings.reduce((acc, r) => acc + r.score, 0);
    return Number((sum / ratings.length).toFixed(2));
  }

  /**
   * Calificaciones públicas de una propiedad. Incluye las anónimas
   * (`userId: null`, sin `user`); `visitorId`/`ipHash` nunca salen.
   */
  async getByProperty(propertyId: number) {
    return this.ratingRepo.find({
      where: { property: { id: propertyId } },
      relations: ['user'],
      select: {
        id: true,
        score: true,
        userId: true,
        user: { id: true, name: true, photo: true },
      },
    });
  }

  /** La calificación de quien mira (su cuenta o su cookie de visitante), o `null`. */
  async getMine(actor: InteractionActor, propertyId: number) {
    if (!actor.userId && !actor.visitorId) return { score: null };
    const where = actor.userId
      ? { userId: actor.userId, propertyId }
      : { visitorId: actor.visitorId, userId: IsNull(), propertyId };
    const r = await this.ratingRepo.findOne({ where, select: { id: true, score: true } });
    return { score: r?.score ?? null };
  }

  /**
   * Valoraciones que hizo un usuario, con la propiedad cargada — alimenta
   * "Propiedades que valoré" del dashboard del usuario.
   */
  async getByUser(userId: number) {
    return this.ratingRepo.find({
      where: { user: { id: userId } },
      relations: ['property', 'property.images', 'property.typeOfProperty'],
      order: { id: 'DESC' },
    });
  }
}
