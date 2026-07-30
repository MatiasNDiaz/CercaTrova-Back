import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StatisticsService } from './statistics.service';
import { StatisticsQueryDto, StatsRange } from './dto/statistics-query.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '../users/enums/role.enum';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';

/**
 * Estadísticas del panel. TODO el módulo es solo-admin: los guards y el
 * `@Roles` van a nivel de clase, así ninguna ruta puede quedar abierta por
 * olvido al agregarla.
 *
 * Cada endpoint acepta `?range=day|week|month` (default `month`).
 */
@Controller('statistics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  /** Todas las secciones en una sola llamada — lo que usa el dashboard. */
  @Get()
  overview(@Query() query: StatisticsQueryDto) {
    return this.statisticsService.overview(query.range ?? StatsRange.MONTH);
  }

  @Get('searched-features')
  searchedFeatures(@Query() query: StatisticsQueryDto) {
    return this.statisticsService.searchedFeatures(query.range ?? StatsRange.MONTH);
  }

  @Get('operation-type')
  operationType(@Query() query: StatisticsQueryDto) {
    return this.statisticsService.operationTypeDemand(query.range ?? StatsRange.MONTH);
  }

  @Get('most-favorited')
  mostFavorited(@Query() query: StatisticsQueryDto) {
    return this.statisticsService.mostFavorited(query.range ?? StatsRange.MONTH);
  }

  @Get('most-commented')
  mostCommented(@Query() query: StatisticsQueryDto) {
    return this.statisticsService.mostCommented(query.range ?? StatsRange.MONTH);
  }

  @Get('best-rated')
  bestRated(@Query() query: StatisticsQueryDto) {
    return this.statisticsService.bestRated(query.range ?? StatsRange.MONTH);
  }

  @Get('most-viewed')
  mostViewed(@Query() query: StatisticsQueryDto) {
    return this.statisticsService.mostViewed(query.range ?? StatsRange.MONTH);
  }

  @Get('traffic')
  traffic(@Query() query: StatisticsQueryDto) {
    return this.statisticsService.traffic(query.range ?? StatsRange.MONTH);
  }

  @Get('registrations')
  registrations(@Query() query: StatisticsQueryDto) {
    return this.statisticsService.registrations(query.range ?? StatsRange.MONTH);
  }

  @Get('property-requests')
  propertyRequests(@Query() query: StatisticsQueryDto) {
    return this.statisticsService.propertyRequests(query.range ?? StatsRange.MONTH);
  }

  @Get('average-time')
  averageTime(@Query() query: StatisticsQueryDto) {
    return this.statisticsService.averageTime(query.range ?? StatsRange.MONTH);
  }

  /** Inventario propio: qué hay cargado en el catálogo (no usa tracking). */
  @Get('own-inventory')
  ownInventory(@Query() query: StatisticsQueryDto) {
    return this.statisticsService.ownInventory(query.range ?? StatsRange.MONTH);
  }
}
