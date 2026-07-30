import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Rating } from './entities/rating.entity';
import { Property } from '../properties/entities/property.entity';
import { Repository } from 'typeorm';
import { NotificationService } from '../notifications/notifications.service'; // 👈
import { ensureExists } from 'src/common/helpers/ensure-exists.helper';
import { isUniqueViolation } from 'src/common/helpers/database-error.helper';

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(Rating)
    private readonly ratingRepo: Repository<Rating>,

    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,

    private readonly notificationService: NotificationService, // 👈
  ) {}

  async rateProperty(userId: number, propertyId: number, score: number) {
    if (score < 1 || score > 5)
      throw new BadRequestException('El puntaje debe ser entre 1 y 5');

    // 🧱 PATRÓN ensureExists: sin esto, valorar una property inexistente
    // violaba la FK y salía como 500 en vez de 404
    await ensureExists(this.propertyRepo, propertyId, 'La propiedad indicada');

    const existingRating = await this.ratingRepo.findOne({
      where: { user: { id: userId }, property: { id: propertyId } },
      relations: ['user', 'property'],
    });

    if (existingRating) {
      existingRating.score = score;
      const updated = await this.ratingRepo.save(existingRating);

      // 👇 Notificar al admin también cuando actualiza su valoración
      this.notificationService
        .notifyAdminNewRating({
          userName: existingRating.user.name,
          propertyTitle: existingRating.property.title,
          propertyId,
          score,
          relatedUserId: existingRating.user.id, // 👈
        })
        .catch((err) => console.error('[NOTIF ADMIN] Error en valoración:', err));

      return updated;
    }

    const rating = this.ratingRepo.create({
      score,
      user: { id: userId },
      property: { id: propertyId },
    });

    let saved: Rating;
    try {
      saved = await this.ratingRepo.save(rating);
    } catch (error) {
      // 🧱 PATRÓN unique violation → 409: dos requests simultáneas del mismo
      // usuario chocan contra la constraint unique(userId, propertyId)
      if (isUniqueViolation(error)) {
        throw new ConflictException('Ya valoraste esta propiedad');
      }
      throw error;
    }

    // 👇 Fetch con relaciones para obtener los nombres
    const full = await this.ratingRepo.findOne({
      where: { id: saved.id },
      relations: ['user', 'property'],
    });

    if (full) {
      this.notificationService
        .notifyAdminNewRating({
          userName: full.user.name,
          propertyTitle: full.property.title,
          propertyId,
          score,
          relatedUserId: full.user.id, // 👈
        })
        .catch((err) => console.error('[NOTIF ADMIN] Error en valoración:', err));
    }

    return saved;
  }

  async getPropertyAverage(propertyId: number) {
    const ratings = await this.ratingRepo.find({
      where: { property: { id: propertyId } },
    });

    if (!ratings.length) return 0;

    const sum = ratings.reduce((acc, r) => acc + r.score, 0);
    return Number((sum / ratings.length).toFixed(2));
  }

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