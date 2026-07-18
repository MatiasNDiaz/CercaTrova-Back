import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Rating } from './entities/rating.entity';
import { Repository } from 'typeorm';
import { NotificationService } from '../notifications/notifications.service'; // 👈

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(Rating)
    private readonly ratingRepo: Repository<Rating>,

    private readonly notificationService: NotificationService, // 👈
  ) {}

  async rateProperty(userId: number, propertyId: number, score: number) {
    if (score < 1 || score > 5)
      throw new BadRequestException('El puntaje debe ser entre 1 y 5');

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

    const saved = await this.ratingRepo.save(rating);

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
}