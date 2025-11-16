import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateRatingDto } from './dto/create-rating.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';
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
    // ✅ Ya calificó → actualizamos
    existingRating.score = score;
    return await this.ratingRepo.save(existingRating);
  }

  // 🆕 Primera vez → creamos
  const rating = this.ratingRepo.create({
    score,
    user: { id: userId },
    property: { id: propertyId },
  });

  return await this.ratingRepo.save(rating);
}

  

}