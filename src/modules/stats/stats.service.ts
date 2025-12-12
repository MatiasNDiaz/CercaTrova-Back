import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSearchFeedback } from '../requests/entities/request.entity';

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(UserSearchFeedback)
    private readonly repo: Repository<UserSearchFeedback>,
  ) {}

  // ----------------------------------------
  // 🟥 1. MÉTRICAS DE DEMANDA + PORCENTAJES
  // ----------------------------------------

  async propertyTypeDemand() {
    const total = await this.repo.count();

    return this.repo
      .createQueryBuilder('u')
      .select('"u"."propertyType"', 'propertyType')
      .addSelect('COUNT(*)', 'count')
      .addSelect(`ROUND(COUNT(*) * 100.0 / ${total}, 2)`, 'percentage')
      .groupBy('"u"."propertyType"')
      .orderBy('count', 'DESC')
      .getRawMany();
  }

  async mostRequestedPropertyType() {
    return this.repo
      .createQueryBuilder('u')
      .select('"u"."propertyType"', 'propertyType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('"u"."propertyType"')
      .orderBy('count', 'DESC')
      .limit(1)
      .getRawOne();
  }

  async leastRequestedPropertyType() {
    return this.repo
      .createQueryBuilder('u')
      .select('"u"."propertyType"', 'propertyType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('"u"."propertyType"')
      .orderBy('count', 'ASC')
      .limit(1)
      .getRawOne();
  }

  async operationTypeDemand() {
    const total = await this.repo.count();

    return this.repo
      .createQueryBuilder('u')
      .select('"u"."operationType"', 'operationType')
      .addSelect('COUNT(*)', 'count')
      .addSelect(`ROUND(COUNT(*) * 100.0 / ${total}, 2)`, 'percentage')
      .groupBy('"u"."operationType"')
      .orderBy('count', 'DESC')
      .getRawMany();
  }

  async mostRequestedOperationType() {
    return this.repo
      .createQueryBuilder('u')
      .select('"u"."operationType"', 'operationType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('"u"."operationType"')
      .orderBy('count', 'DESC')
      .limit(1)
      .getRawOne();
  }

  async leastRequestedOperationType() {
    return this.repo
      .createQueryBuilder('u')
      .select('"u"."operationType"', 'operationType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('"u"."operationType"')
      .orderBy('count', 'ASC')
      .limit(1)
      .getRawOne();
  }

  async demandByZone() {
    const total = await this.repo.count();

    return this.repo
      .createQueryBuilder('u')
      .select('"u"."zone"', 'zone')
      .addSelect('COUNT(*)', 'count')
      .addSelect(`ROUND(COUNT(*) * 100.0 / ${total}, 2)`, 'percentage')
      .groupBy('"u"."zone"')
      .orderBy('count', 'DESC')
      .getRawMany();
  }

  async demandByCity() {
    const total = await this.repo.count();

    return this.repo
      .createQueryBuilder('u')
      .select('"u"."city"', 'city')
      .addSelect('COUNT(*)', 'count')
      .addSelect(`ROUND(COUNT(*) * 100.0 / ${total}, 2)`, 'percentage')
      .groupBy('"u"."city"')
      .orderBy('count', 'DESC')
      .getRawMany();
  }

  // ----------------------------------------
  // 🟧 2. MÉTRICAS DE PRECIO
  // ----------------------------------------

  async averagePrice() {
    return this.repo
      .createQueryBuilder('u')
      .select('AVG(("u"."priceMin" + "u"."priceMax") / 2)', 'averagePrice')
      .getRawOne();
  }

  async lowestPriceRequested() {
    return this.repo
      .createQueryBuilder('u')
      .select('MIN("u"."priceMin")', 'lowestPrice')
      .getRawOne();
  }

  async highestPriceRequested() {
    return this.repo
      .createQueryBuilder('u')
      .select('MAX("u"."priceMax")', 'highestPrice')
      .getRawOne();
  }

  async priceRanges() {
    return this.repo.query(`
      SELECT 
        CASE 
          WHEN ("priceMin" + "priceMax") / 2 < 80000 THEN 'Menos de 80k'
          WHEN ("priceMin" + "priceMax") / 2 BETWEEN 80000 AND 120000 THEN '80k - 120k'
          WHEN ("priceMin" + "priceMax") / 2 BETWEEN 120k AND 200k THEN '120k - 200k'
          ELSE 'Más de 200k'
        END AS range,
        COUNT(*) AS count
      FROM "user_search_feedback"
      GROUP BY range
      ORDER BY count DESC;
    `);
  }

  async priceByPropertyType() {
    return this.repo
      .createQueryBuilder('u')
      .select('"u"."propertyType"', 'propertyType')
      .addSelect('AVG(("u"."priceMin" + "u"."priceMax") / 2)', 'avgPrice')
      .groupBy('"u"."propertyType"')
      .orderBy('avgPrice', 'DESC')
      .getRawMany();
  }

  async priceByZone() {
    return this.repo
      .createQueryBuilder('u')
      .select('"u"."zone"', 'zone')
      .addSelect('AVG(("u"."priceMin" + "u"."priceMax") / 2)', 'avgPrice')
      .groupBy('"u"."zone"')
      .orderBy('avgPrice', 'DESC')
      .getRawMany();
  }

  // ----------------------------------------
  // 🟨 3. AMBIENTES & COMODIDADES
  // ----------------------------------------

  async averageRooms() {
    return this.repo
      .createQueryBuilder('u')
      .select('AVG("u"."rooms")', 'avgRooms')
      .getRawOne();
  }

  async averageBathrooms() {
    return this.repo
      .createQueryBuilder('u')
      .select('AVG("u"."bathrooms")', 'avgBathrooms')
      .getRawOne();
  }

  async roomsDistribution() {
    const total = await this.repo.count();

    return this.repo
      .createQueryBuilder('u')
      .select('"u"."rooms"', 'rooms')
      .addSelect('COUNT(*)', 'count')
      .addSelect(`ROUND(COUNT(*) * 100.0 / ${total}, 2)`, 'percentage')
      .groupBy('"u"."rooms"')
      .orderBy('"u"."rooms"', 'ASC')
      .getRawMany();
  }

  async extrasUsage() {
    const total = await this.repo.count();

    return this.repo.query(`
      SELECT
        SUM(CASE WHEN "hasGarage" = true THEN 1 ELSE 0 END) AS garageCount,
        ROUND(SUM(CASE WHEN "hasGarage" = true THEN 1 ELSE 0 END) * 100.0 / ${total}, 2) AS garagePercentage,

        SUM(CASE WHEN "hasPatio" = true THEN 1 ELSE 0 END) AS patioCount,
        ROUND(SUM(CASE WHEN "hasPatio" = true THEN 1 ELSE 0 END) * 100.0 / ${total}, 2) AS patioPercentage
      FROM "user_search_feedback";
    `);
  }

  // ----------------------------------------
  // 🟩 4. ANTIGÜEDAD
  // ----------------------------------------

  async averageAntiquity() {
    return this.repo
      .createQueryBuilder('u')
      .select('AVG(("u"."antiquityMin" + "u"."antiquityMax") / 2)', 'avgAntiquity')
      .getRawOne();
  }

  async newConstructionInterest() {
    const total = await this.repo.count();

    return this.repo
      .createQueryBuilder('u')
      .select('COUNT(*)', 'count')
      .addSelect(`ROUND(COUNT(*) * 100.0 / ${total}, 2)`, 'percentage')
      .where('"u"."antiquityMin" = 0 OR "u"."antiquityMax" = 0')
      .getRawOne();
  }
}
