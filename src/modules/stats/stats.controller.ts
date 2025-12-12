// stats.controller.ts
import { Controller, Get } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  // ----------------------------------------
  // 1. DEMANDA
  // ----------------------------------------

  @Get('property-type')
  getPropertyTypes() {
    return this.stats.propertyTypeDemand();
  }

  @Get('property-type/top')
  getMostRequestedPropertyType() {
    return this.stats.mostRequestedPropertyType();
  }

  @Get('property-type/least')
  getLeastRequestedPropertyType() {
    return this.stats.leastRequestedPropertyType();
  }

  @Get('operation-type')
  getOperationTypes() {
    return this.stats.operationTypeDemand();
  }

  @Get('operation-type/top')
  getMostRequestedOperationType() {
    return this.stats.mostRequestedOperationType();
  }

  @Get('operation-type/least')
  getLeastRequestedOperationType() {
    return this.stats.leastRequestedOperationType();
  }

  @Get('zones')
  getZones() {
    return this.stats.demandByZone();
  }

  @Get('cities')
  getCities() {
    return this.stats.demandByCity();
  }

  // ----------------------------------------
  // 2. PRECIO
  // ----------------------------------------

  @Get('price/average')
  getAveragePrice() {
    return this.stats.averagePrice();
  }

  @Get('price/ranges')
  getPriceRanges() {
    return this.stats.priceRanges();
  }

  @Get('price/by-property-type')
  getPriceByType() {
    return this.stats.priceByPropertyType();
  }

  @Get('price/by-zone')
  getPriceByZone() {
    return this.stats.priceByZone();
  }

  @Get('price/min')
  getMinPrice() {
    return this.stats.lowestPriceRequested();
  }

  @Get('price/max')
  getMaxPrice() {
    return this.stats.highestPriceRequested();
  }

  // ----------------------------------------
  // 3. AMBIENTES & EXTRAS
  // ----------------------------------------

  @Get('rooms/average')
  getAverageRooms() {
    return this.stats.averageRooms();
  }

  @Get('bathrooms/average')
  getAverageBathrooms() {
    return this.stats.averageBathrooms();
  }

  @Get('rooms/distribution')
  getRoomsDistribution() {
    return this.stats.roomsDistribution();
  }

  @Get('extras')
  getExtrasUsage() {
    return this.stats.extrasUsage();
  }

  @Get('extras/patio')
  getPatioPercentage() {
    return this.stats.extrasUsage();
  }

  @Get('extras/garage')
  getGaragePercentage() {
    return this.stats.extrasUsage();
  }

  // ----------------------------------------
  // 4. ANTIGÜEDAD
  // ----------------------------------------

  @Get('antiquity/average')
  getAverageAntiquity() {
    return this.stats.averageAntiquity();
  }

  @Get('antiquity/new-construction')
  getNewConstructionInterest() {
    return this.stats.newConstructionInterest();
  }
}
