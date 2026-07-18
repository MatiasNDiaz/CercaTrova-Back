import { Module } from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { RatingsController } from './ratings.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rating } from './entities/rating.entity';
import { NotificationModule } from '../notifications/notifications.module'; // 👈

@Module({
  imports: [
    TypeOrmModule.forFeature([Rating]),
    NotificationModule, // 👈
  ],
  controllers: [RatingsController],
  providers: [RatingsService],
  exports: [RatingsService],
})
export class RatingsModule {}