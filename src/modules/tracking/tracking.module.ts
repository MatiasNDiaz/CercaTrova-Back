import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackingService } from './tracking.service';
import { TrackingController } from './tracking.controller';
import { VisitorIdMiddleware } from './visitor-id.middleware';
import { PageVisit } from './entities/page-visit.entity';
import { PropertyView } from './entities/property-view.entity';
import { FilterUsage } from './entities/filter-usage.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PageVisit, PropertyView, FilterUsage])],
  controllers: [TrackingController],
  providers: [TrackingService],
  exports: [TrackingService],
})
export class TrackingModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // La cookie de visitante se garantiza en TODAS las rutas, no solo en las
    // de tracking: `GET /properties/:id` y `/properties/filter` también la
    // necesitan, y son de otro módulo.
    consumer.apply(VisitorIdMiddleware).forRoutes('*');
  }
}
