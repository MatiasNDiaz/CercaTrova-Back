// stats.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSearchFeedback } from '../requests/entities/request.entity';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserSearchFeedback])],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
