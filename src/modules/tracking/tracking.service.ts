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
