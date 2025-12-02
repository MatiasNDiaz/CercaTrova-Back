import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Rating } from './entities/rating.entity';
import { Repository } from 'typeorm';

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(Rating)
    private readonly ratingRepo: Repository<Rating>,
  ) {}

  async rateProperty(userId: number, propertyId: number, score: number) {

    if (score < 1 || score > 5) {
      throw new BadRequestException('El puntaje debe ser entre 1 y 5');
    }

    const existingRating = await this.ratingRepo.findOne({
      where: {
        user: { id: userId },
        property: { id: propertyId },
      },
      relations: ['user', 'property'],
    });

    if (existingRating) {
      existingRating.score = score;
      return await this.ratingRepo.save(existingRating);
    }

    const rating = this.ratingRepo.create({
      score,
      user: { id: userId },
      property: { id: propertyId },
    });

    return await this.ratingRepo.save(rating);
  }

  async getPropertyAverage(propertyId: number) {
    const ratings = await this.ratingRepo.find({
      where: { property: { id: propertyId } },
    });

    if (!ratings.length) return 0;

    const sum = ratings.reduce((acc, r) => acc + r.score, 0);
    return Number((sum / ratings.length).toFixed(2));
  }
}
