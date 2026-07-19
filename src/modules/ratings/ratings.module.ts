import { Module } from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { RatingsController } from './ratings.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rating } from './entities/rating.entity';
import { Property } from '../properties/entities/property.entity';
import { NotificationModule } from '../notifications/notifications.module'; // 👈

@Module({
  imports: [
    // Property se registra para validar que exista antes de crear un rating
    TypeOrmModule.forFeature([Rating, Property]),
    NotificationModule, // 👈
  ],
  controllers: [RatingsController],
  providers: [RatingsService],
  exports: [RatingsService],
})
export class RatingsModule {}