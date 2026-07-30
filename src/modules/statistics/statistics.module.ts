import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatisticsService } from './statistics.service';
import { StatisticsController } from './statistics.controller';
import { FilterUsage } from '../tracking/entities/filter-usage.entity';
import { PageVisit } from '../tracking/entities/page-visit.entity';
import { PropertyView } from '../tracking/entities/property-view.entity';
import { SearchPreference } from '../search-preferences/entities/search-preference.entity';
import { Property } from '../properties/entities/property.entity';
import { User } from '../users/entities/user.entity';
import { PropertyRequest } from '../PropertyRequest/entities/PropertyRequest';
import { Favorite } from '../favorites/entities/favorite.entity';
import { Comment } from '../comments/entities/comment.entity';
import { Rating } from '../ratings/entities/rating.entity';
import { PropertyType } from '../typeOfProperty/entities/typeOfProperty.entity';

/**
 * Módulo de estadísticas del panel.
 *
 * Solo declara repositorios (lectura): no depende de los services de los otros
 * módulos ni del módulo `stats` viejo, que sigue existiendo y funcionando por
 * su cuenta sobre `user_search_feedback`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FilterUsage, PageVisit, PropertyView,
      SearchPreference, Property, User,
      PropertyRequest, Favorite, Comment, Rating, PropertyType,
    ]),
  ],
  controllers: [StatisticsController],
  providers: [StatisticsService],
})
export class StatisticsModule {}
