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
    // Guard división por cero: sin datos no hay porcentajes que calcular
    if (total === 0) return [];

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
    // Guard división por cero
    if (total === 0) return [];

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
    // Guard división por cero
    if (total === 0) return [];

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
    // Guard división por cero
    if (total === 0) return [];

    // FIX: la columna se llama "localidad" — "city" no existe y tiraba 500
    return this.repo
      .createQueryBuilder('u')
      .select('"u"."localidad"', 'localidad')
      .addSelect('COUNT(*)', 'count')
      .addSelect(`ROUND(COUNT(*) * 100.0 / ${total}, 2)`, 'percentage')
      .groupBy('"u"."localidad"')
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
          WHEN ("priceMin" + "priceMax") / 2 BETWEEN 120000 AND 200000 THEN '120k - 200k'
          ELSE 'Más de 200k'
        END AS range,
        COUNT(*) AS count
      FROM "user_search_feedback"
      GROUP BY range
      ORDER BY count DESC;
    `);
  }

  // 🐛 FIX: `orderBy('avgPrice', ...)` generaba `ORDER BY avgprice` SIN comillas.
  // Postgres pliega a minúsculas los identificadores sin comillar, y el alias
  // del select sí va comillado (`"avgPrice"`), así que nunca matcheaban: los
  // dos endpoints respondían 500 «no existe la columna "avgprice"» SIEMPRE,
  // hubiera datos o no. Se ordena por la EXPRESIÓN en vez de por el alias, que
  // es inmune al plegado de mayúsculas.
  private static readonly AVG_PRICE_EXPR = 'AVG(("u"."priceMin" + "u"."priceMax") / 2)';

  async priceByPropertyType() {
    return this.repo
      .createQueryBuilder('u')
      .select('"u"."propertyType"', 'propertyType')
      .addSelect(StatsService.AVG_PRICE_EXPR, 'avgPrice')
      .groupBy('"u"."propertyType"')
      .orderBy(StatsService.AVG_PRICE_EXPR, 'DESC')
      .getRawMany();
  }

  async priceByZone() {
    return this.repo
      .createQueryBuilder('u')
      .select('"u"."zone"', 'zone')
      .addSelect(StatsService.AVG_PRICE_EXPR, 'avgPrice')
      .groupBy('"u"."zone"')
      .orderBy(StatsService.AVG_PRICE_EXPR, 'DESC')
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
    // Guard división por cero
    if (total === 0) return [];

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
    // Guard división por cero: devolvemos ceros con la misma forma de respuesta
    if (total === 0) {
      return [
        { garagecount: 0, garagepercentage: 0, patiocount: 0, patiopercentage: 0 },
      ];
    }

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
    // FIX: la entidad solo tiene "antiquityMax" — "antiquityMin" no existe
    // y la query anterior tiraba 500
    return this.repo
      .createQueryBuilder('u')
      .select('AVG("u"."antiquityMax")', 'avgAntiquity')
      .getRawOne();
  }

  async newConstructionInterest() {
    const total = await this.repo.count();
    // Guard división por cero
    if (total === 0) return { count: 0, percentage: 0 };

    // FIX: "antiquityMin" no existe en la entidad — solo "antiquityMax"
    return this.repo
      .createQueryBuilder('u')
      .select('COUNT(*)', 'count')
      .addSelect(`ROUND(COUNT(*) * 100.0 / ${total}, 2)`, 'percentage')
      .where('"u"."antiquityMax" = 0')
      .getRawOne();
  }
}
