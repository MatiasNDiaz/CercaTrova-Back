import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PageVisit } from './entities/page-visit.entity';
import { PropertyView } from './entities/property-view.entity';
import { FilterUsage } from './entities/filter-usage.entity';
import { PropertyFilterDto } from '../properties/dto/property-filter.dto';
import { Role } from '../users/enums/role.enum';

/**
 * Registro de eventos para las estadísticas del panel (Fase 0).
 *
 * REGLA GENERAL: nada de lo que hace este servicio puede frenar ni romper la
 * request que lo dispara. Todos los métodos capturan sus propios errores y solo
 * loguean — una falla al guardar una métrica jamás debe devolverle un error al
 * usuario que estaba navegando el catálogo.
 */
@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    @InjectRepository(PageVisit)
    private readonly visitRepo: Repository<PageVisit>,

    @InjectRepository(PropertyView)
    private readonly viewRepo: Repository<PropertyView>,

    @InjectRepository(FilterUsage)
    private readonly filterRepo: Repository<FilterUsage>,
  ) {}

  /** Registra una visita a una página. Devuelve el id para poder cerrarla después. */
  async recordVisit(data: {
    visitorId: string;
    path: string;
    userId?: number | null;
    role?: Role;
  }): Promise<{ visitId: number | null }> {
    try {
      const visit = await this.visitRepo.save(
        this.visitRepo.create({
          visitorId: data.visitorId,
          path: data.path,
          userId: data.userId ?? null,
          isAdmin: data.role === Role.ADMIN,
        }),
      );
      return { visitId: visit.id };
    } catch (error) {
      this.logger.error('No se pudo registrar la visita', error as Error);
      return { visitId: null };
    }
  }

  /**
   * Completa la duración de una visita ya registrada.
   * Solo actualiza si la fila corresponde al mismo visitante: sin eso,
   * cualquiera podría escribir duraciones en visitas ajenas.
   */
  async recordDuration(visitId: number, visitorId: string, durationMs: number): Promise<void> {
    try {
      // Se descartan valores absurdos (negativos o de más de 6 horas): casi
      // siempre son pestañas que quedaron abiertas toda la noche y arruinan
      // el promedio.
      const MAX_MS = 6 * 60 * 60 * 1000;
      if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_MS) return;

      await this.visitRepo.update({ id: visitId, visitorId }, { durationMs: Math.round(durationMs) });
    } catch (error) {
      this.logger.error('No se pudo registrar la duración de la visita', error as Error);
    }
  }

  /**
   * Registra una vista del detalle de una propiedad.
   * Las del admin NO se registran (ensuciarían el ranking de más visitadas).
   */
  async recordPropertyView(data: {
    propertyId: number;
    visitorId: string;
    userId?: number | null;
    role?: Role;
  }): Promise<void> {
    if (data.role === Role.ADMIN) return;

    try {
      await this.viewRepo.save(
        this.viewRepo.create({
          propertyId: data.propertyId,
          visitorId: data.visitorId,
          userId: data.userId ?? null,
        }),
      );
    } catch (error) {
      this.logger.error('No se pudo registrar la vista de propiedad', error as Error);
    }
  }

  /**
   * Personas distintas que abrieron la ficha de cada propiedad en los últimos
   * `WEEKLY_VISITORS_WINDOW_DAYS` días. Alimenta la etiqueta pública
   * "VISTA POR X PERSONAS" del catálogo, así que tiene que ser un dato REAL y
   * conservador. Reglas de conteo:
   *
   *  - Fuente: `page_visits`, NO `property_views`. ⚠️ `property_views` se
   *    registra en `GET /properties/:id`, y esa request la hace el SERVIDOR de
   *    Next (SSR en Vercel) sin la cookie del navegador: cada vista recibe un
   *    `visitorId` nuevo, así que ahí "únicos" = "vistas totales" (recargas,
   *    bots y previews de WhatsApp incluidos). `page_visits` la registra el
   *    propio navegador (`VisitTracker`), con la cookie anónima estable.
   *  - Una persona = un `visitorId` (cookie `ct_vid`, dura 1 año). La misma
   *    persona recargando 20 veces en la semana cuenta UNA vez:
   *    `COUNT(DISTINCT visitorId)` sobre toda la ventana.
   *  - Sin el equipo: se excluyen las visitas con `isAdmin = true`.
   *  - Sin el id comodín 'desconocido' (request que llegó sin cookie).
   *  - Solo la ficha exacta `/properties/<id>`: el listado no cuenta.
   *
   * Límite honesto: dos navegadores de la misma persona cuentan como dos, y un
   * bot que ejecute JS sin guardar cookies podría sumar. El error va siempre en
   * el mismo sentido acotado; no hay ningún número inventado.
   */
  static readonly WEEKLY_VISITORS_WINDOW_DAYS = 7;

  async weeklyPropertyVisitors(): Promise<{
    windowDays: number;
    items: { propertyId: number; visitors: number }[];
  }> {
    const windowDays = TrackingService.WEEKLY_VISITORS_WINDOW_DAYS;
    try {
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
      const idExpr = `CAST(SUBSTRING("v"."path" FROM '^/properties/([0-9]+)$') AS integer)`;

      const rows = await this.visitRepo
        .createQueryBuilder('v')
        .select(idExpr, 'propertyId')
        .addSelect('COUNT(DISTINCT "v"."visitorId")', 'visitors')
        .where('"v"."createdAt" > :since', { since })
        .andWhere('"v"."isAdmin" = false')
        .andWhere(`"v"."visitorId" <> 'desconocido'`)
        .andWhere(`"v"."path" ~ '^/properties/[0-9]+$'`)
        .groupBy(idExpr)
        .orderBy('"visitors"', 'DESC')
        .limit(200)
        .getRawMany<{ propertyId: number; visitors: string }>();

      return {
        windowDays,
        items: rows.map((r) => ({ propertyId: Number(r.propertyId), visitors: Number(r.visitors) })),
      };
    } catch (error) {
      // Regla del servicio: una métrica nunca rompe la página que la pide. Sin
      // datos, la etiqueta simplemente no aparece.
      this.logger.error('No se pudieron calcular los visitantes semanales', error as Error);
      return { windowDays, items: [] };
    }
  }

  /**
   * Registra los criterios de una búsqueda del catálogo.
   *
   * Se ignoran `page`, `limit`, `sortBy`, `order` y `status`: son controles de
   * la grilla, no intención de búsqueda. Si la búsqueda no tenía NINGÚN filtro
   * real, no se guarda nada (sería ruido: es el catálogo sin filtrar).
   */
  async recordFilterUsage(
    filters: PropertyFilterDto,
    visitorId: string,
    userId?: number | null,
    role?: Role,
  ): Promise<void> {
    if (role === Role.ADMIN) return;

    try {
      // Los booleanos llegan como string desde la query ('true'/'false') y
      // solo interesan cuando el usuario los activó.
      const bool = (v?: string) => (String(v) === 'true' ? true : undefined);

      const row: Partial<FilterUsage> = {
        visitorId,
        userId: userId ?? null,
        provincia: filters.provincia,
        localidad: filters.localidad,
        barrio: filters.barrio,
        zone: filters.zone,
        typeOfPropertyId: filters.typeOfPropertyId,
        operationType: filters.operationType,
        rooms: filters.rooms,
        bathrooms: filters.bathrooms,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        minSupTotal: filters.minSupTotal,
        maxSupTotal: filters.maxSupTotal,
        minSupCubierta: filters.minSupCubierta,
        maxSupCubierta: filters.maxSupCubierta,
        maxAntiquity: filters.maxAntiquity,
        garage: bool(filters.garage),
        patio: bool(filters.patio),
        property_deed: bool(filters.property_deed),
        tractoAbreviado: bool(filters.tractoAbreviado),
        boleto: bool(filters.boleto),
        search: filters.search,
      };

      // ¿Hay al menos un criterio real? (visitorId/userId no cuentan)
      const tieneCriterios = Object.entries(row).some(
        ([k, v]) => !['visitorId', 'userId'].includes(k) && v !== undefined && v !== null && v !== '',
      );
      if (!tieneCriterios) return;

      await this.filterRepo.save(this.filterRepo.create(row));
    } catch (error) {
      this.logger.error('No se pudo registrar el uso de filtros', error as Error);
    }
  }
}
