import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
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
import { StatsRange, rangeToDate } from './dto/statistics-query.dto';
import {
  Period, REAL_VISITS_SQL, percentChange, pagesPerVisitor, realVisitsParams, visitorPeriods,
} from './visitors';

/** Fila estándar de todos los rankings: etiqueta, cantidad y porcentaje. */
export interface StatRow {
  label: string;
  count: number;
  percentage: number;
}

/** Propiedad dentro de un ranking. */
export interface PropertyRankRow {
  propertyId: number;
  title: string;
  imageUrl: string | null;
  localidad: string;
  count: number;
  /** Solo en el ranking de valoraciones. */
  average?: number;
}

const TOP_N = 8;

/**
 * Estadísticas del panel de administración.
 *
 * ## De dónde salen los datos
 *
 * Las secciones de "qué buscan los usuarios" combinan DOS fuentes:
 *
 *  1. `FilterUsage` — se escribe sola en cada `GET /properties/filter`. Es la
 *     intención de búsqueda real, incluida la de visitantes sin cuenta.
 *  2. `SearchPreference` — las preferencias que un usuario logueado guardó.
 *     Cada preferencia cuenta como un voto hacia esos valores.
 *
 * Cada característica suma las apariciones de ambas fuentes dentro del rango y
 * se saca el porcentaje sobre el total de esa categoría.
 *
 * ⚠️ Este módulo NO usa `user_search_feedback` ni el módulo `stats` viejo: esa
 * tabla se completa a mano desde un formulario y no refleja el uso real del
 * catálogo. El módulo viejo sigue intacto y funcionando por su cuenta.
 *
 * En `SearchPreference` se filtra por `updatedAt` y no por `createdAt`: una
 * preferencia editada hoy expresa una intención de hoy, aunque se haya creado
 * hace meses.
 */
@Injectable()
export class StatisticsService {
  private readonly logger = new Logger(StatisticsService.name);

  constructor(
    @InjectRepository(FilterUsage) private readonly filterRepo: Repository<FilterUsage>,
    @InjectRepository(PageVisit) private readonly visitRepo: Repository<PageVisit>,
    @InjectRepository(PropertyView) private readonly viewRepo: Repository<PropertyView>,
    @InjectRepository(SearchPreference) private readonly prefRepo: Repository<SearchPreference>,
    @InjectRepository(Property) private readonly propertyRepo: Repository<Property>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(PropertyRequest) private readonly requestRepo: Repository<PropertyRequest>,
    @InjectRepository(Favorite) private readonly favoriteRepo: Repository<Favorite>,
    @InjectRepository(Comment) private readonly commentRepo: Repository<Comment>,
    @InjectRepository(Rating) private readonly ratingRepo: Repository<Rating>,
    @InjectRepository(PropertyType) private readonly typeRepo: Repository<PropertyType>,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  /** Convierte pares etiqueta/cantidad en filas con porcentaje, ordenadas. */
  private toRows(counts: Map<string, number>, limit = TOP_N): StatRow[] {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    return [...counts.entries()]
      .filter(([label]) => label && label.trim() !== '')
      .map(([label, count]) => ({
        label,
        count,
        percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Cuenta un campo de texto combinando las dos fuentes.
   * `prefField` es opcional: no toda característica existe en las preferencias.
   */
  private async combinedTextCount(
    since: Date,
    filterField: keyof FilterUsage,
    prefField?: keyof SearchPreference,
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    const add = (value?: string | null) => {
      if (!value) return;
      const key = String(value).trim();
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    };

    const filas = await this.filterRepo.find({ where: { createdAt: MoreThan(since) } });
    filas.forEach((f) => add(f[filterField] as unknown as string));

    if (prefField) {
      const prefs = await this.prefRepo.find({ where: { updatedAt: MoreThan(since) } });
      prefs.forEach((p) => add(p[prefField] as unknown as string));
    }

    return counts;
  }

  /** Promedio de un campo numérico combinando ambas fuentes. */
  private async combinedAverage(
    since: Date,
    filterField: keyof FilterUsage,
    prefField?: keyof SearchPreference,
  ): Promise<number> {
    const valores: number[] = [];

    const filas = await this.filterRepo.find({ where: { createdAt: MoreThan(since) } });
    filas.forEach((f) => {
      const v = Number(f[filterField]);
      if (Number.isFinite(v) && v > 0) valores.push(v);
    });

    if (prefField) {
      const prefs = await this.prefRepo.find({ where: { updatedAt: MoreThan(since) } });
      prefs.forEach((p) => {
        const v = Number(p[prefField]);
        if (Number.isFinite(v) && v > 0) valores.push(v);
      });
    }

    if (valores.length === 0) return 0;
    return Number((valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(1));
  }

  // ═══════════════════════════════════════════════════════════
  // 1. CARACTERÍSTICAS MÁS BUSCADAS  (Fase 1)
  // ═══════════════════════════════════════════════════════════
  async searchedFeatures(range: StatsRange) {
    const since = rangeToDate(range);

    const [zonas, localidades, barrios, provincias] = await Promise.all([
      this.combinedTextCount(since, 'zone', 'zone'),
      this.combinedTextCount(since, 'localidad', 'localidad'),
      this.combinedTextCount(since, 'barrio', 'barrio'),
      this.combinedTextCount(since, 'provincia'),
    ]);

    // Tipo de propiedad: el id se resuelve a nombre para que el gráfico sea legible.
    const tipos = await this.resolvePropertyTypeNames(since);

    const [habitaciones, banios] = await Promise.all([
      this.combinedTextCount(since, 'rooms', 'minRooms'),
      this.combinedTextCount(since, 'bathrooms', 'minBathrooms'),
    ]);

    const [antiguedadPromedio, supTotalPromedio, precioPromedio] = await Promise.all([
      this.combinedAverage(since, 'maxAntiquity', 'maxAntiquity'),
      this.combinedAverage(since, 'minSupTotal', 'supTotal'),
      this.combinedAverage(since, 'maxPrice', 'preferredPrice'),
    ]);

    return {
      range,
      zonas: this.toRows(zonas),
      localidades: this.toRows(localidades),
      barrios: this.toRows(barrios),
      provincias: this.toRows(provincias),
      tiposDePropiedad: tipos,
      habitaciones: this.toRows(habitaciones),
      banios: this.toRows(banios),
      rangosDePrecio: await this.priceRanges(since),
      extras: await this.extrasUsage(since),
      promedios: {
        antiguedadMaxima: antiguedadPromedio,
        supTotal: supTotalPromedio,
        precio: Math.round(precioPromedio),
      },
      // Se expone para que el frontend pueda avisar "todavía no hay datos"
      // en vez de dibujar un gráfico vacío sin explicación.
      totalBusquedas: [...zonas.values()].reduce((a, b) => a + b, 0),
    };
  }

  /** Tipo de propiedad más buscado, con el nombre real (no el id). */
  private async resolvePropertyTypeNames(since: Date): Promise<StatRow[]> {
    const counts = new Map<number, number>();

    const filas = await this.filterRepo.find({ where: { createdAt: MoreThan(since) } });
    filas.forEach((f) => {
      if (f.typeOfPropertyId) counts.set(f.typeOfPropertyId, (counts.get(f.typeOfPropertyId) ?? 0) + 1);
    });

    const prefs = await this.prefRepo.find({
      where: { updatedAt: MoreThan(since) },
      relations: ['typeOfProperty'],
    });
    prefs.forEach((p) => {
      const id = p.typeOfProperty?.id;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    });

    if (counts.size === 0) return [];

    // ⚠️ `getRepository('property_type')` por NOMBRE de tabla no funciona:
    // TypeORM resuelve metadata por clase de entidad, no por string. Se usa el
    // repositorio inyectado de `PropertyType`.
    const tipos = await this.typeRepo.find({ where: [...counts.keys()].map((id) => ({ id })) });
    const nombres = new Map(tipos.map((t) => [t.id, t.name]));
    const porNombre = new Map<string, number>();
    counts.forEach((count, id) => {
      porNombre.set(nombres.get(id) ?? `Tipo #${id}`, count);
    });

    return this.toRows(porNombre);
  }

  /** Distribución de las búsquedas por franja de precio. */
  private async priceRanges(since: Date): Promise<StatRow[]> {
    const FRANJAS = [
      { label: 'Hasta USD 50.000', max: 50_000 },
      { label: 'USD 50.000 – 100.000', max: 100_000 },
      { label: 'USD 100.000 – 200.000', max: 200_000 },
      { label: 'USD 200.000 – 350.000', max: 350_000 },
      { label: 'Más de USD 350.000', max: Infinity },
    ];
    const counts = new Map<string, number>(FRANJAS.map((f) => [f.label, 0]));

    const clasificar = (precio?: number | null) => {
      if (!precio || precio <= 0) return;
      const franja = FRANJAS.find((f) => precio <= f.max);
      if (franja) counts.set(franja.label, (counts.get(franja.label) ?? 0) + 1);
    };

    // Del filtro se toma el techo que puso el usuario; de la preferencia, el
    // precio que declaró estar dispuesto a pagar.
    (await this.filterRepo.find({ where: { createdAt: MoreThan(since) } }))
      .forEach((f) => clasificar(f.maxPrice));
    (await this.prefRepo.find({ where: { updatedAt: MoreThan(since) } }))
      .forEach((p) => clasificar(p.preferredPrice));

    // No se recorta a TOP_N: son franjas fijas y se muestran todas.
    return this.toRows(counts, FRANJAS.length);
  }

  /** Porcentaje de búsquedas que pidieron cada extra. */
  private async extrasUsage(since: Date) {
    const filas = await this.filterRepo.find({ where: { createdAt: MoreThan(since) } });
    const prefs = await this.prefRepo.find({ where: { updatedAt: MoreThan(since) } });
    const total = filas.length + prefs.length;

    const contar = (fFlag: keyof FilterUsage, pFlag: keyof SearchPreference) =>
      filas.filter((f) => f[fFlag] === true).length +
      prefs.filter((p) => p[pFlag] === true).length;

    const extras = [
      { label: 'Cochera', count: contar('garage', 'garage') },
      { label: 'Patio', count: contar('patio', 'patio') },
      { label: 'Escritura', count: contar('property_deed', 'property_deed') },
      { label: 'Tracto abreviado', count: contar('tractoAbreviado', 'tractoAbreviado') },
      { label: 'Boleto', count: contar('boleto', 'boleto') },
    ];

    return extras
      .map((e) => ({
        ...e,
        // Acá el porcentaje es sobre el TOTAL de búsquedas (no entre extras):
        // la pregunta es "qué % de las búsquedas pidió cochera", y una misma
        // búsqueda puede pedir varios extras a la vez.
        percentage: total > 0 ? Number(((e.count / total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  // ═══════════════════════════════════════════════════════════
  // 2. TIPO DE OPERACIÓN BUSCADO (torta)
  // ═══════════════════════════════════════════════════════════
  async operationTypeDemand(range: StatsRange) {
    const since = rangeToDate(range);
    const counts = await this.combinedTextCount(since, 'operationType', 'operationType');
    return { range, data: this.toRows(counts, 10) };
  }

  // ═══════════════════════════════════════════════════════════
  // 3-5. RANKINGS DE PROPIEDADES (favoritos, comentarios, valoraciones)
  // ═══════════════════════════════════════════════════════════

  /** Completa título/imagen/localidad de un conjunto de ids. */
  private async decorateProperties(
    rows: { propertyId: number; count: number; average?: number }[],
  ): Promise<PropertyRankRow[]> {
    if (rows.length === 0) return [];

    const props = await this.propertyRepo.find({
      where: rows.map((r) => ({ id: r.propertyId })),
      relations: ['images'],
    });
    const byId = new Map(props.map((p) => [p.id, p]));

    return rows.map((r) => {
      const p = byId.get(r.propertyId);
      const cover = p?.images?.find((i) => i.isCover)?.url ?? p?.images?.[0]?.url ?? null;
      return {
        propertyId: r.propertyId,
        title: p?.title ?? `Propiedad #${r.propertyId}`,
        imageUrl: cover,
        localidad: p?.localidad ?? '',
        count: r.count,
        ...(r.average !== undefined ? { average: r.average } : {}),
      };
    });
  }

  /**
   * ⚠️ `Favorite` no tiene fecha (su PK es user_id + property_id), así que este
   * ranking es HISTÓRICO y el filtro de rango no lo afecta. Se devuelve
   * `rangeApplies: false` para que el frontend lo aclare en pantalla en vez de
   * mostrar un número que parece filtrado y no lo está.
   */
  async mostFavorited(range: StatsRange) {
    const raw = await this.favoriteRepo
      .createQueryBuilder('f')
      .select('f.property_id', 'propertyId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('f.property_id')
      .orderBy('COUNT(*)', 'DESC')
      .limit(TOP_N)
      .getRawMany<{ propertyId: number; count: string }>();

    return {
      range,
      rangeApplies: false,
      data: await this.decorateProperties(
        raw.map((r) => ({ propertyId: Number(r.propertyId), count: Number(r.count) })),
      ),
    };
  }

  async mostCommented(range: StatsRange) {
    const since = rangeToDate(range);
    const raw = await this.commentRepo
      .createQueryBuilder('c')
      .select('c.propertyId', 'propertyId')
      .addSelect('COUNT(*)', 'count')
      .where('c.created_at > :since', { since })
      .groupBy('c.propertyId')
      .orderBy('COUNT(*)', 'DESC')
      .limit(TOP_N)
      .getRawMany<{ propertyId: number; count: string }>();

    return {
      range,
      rangeApplies: true,
      data: await this.decorateProperties(
        raw.map((r) => ({ propertyId: Number(r.propertyId), count: Number(r.count) })),
      ),
    };
  }

  /**
   * ⚠️ `Rating` tampoco guarda fecha, así que el promedio es histórico.
   * Se exige un mínimo de 2 valoraciones para no rankear primero a una
   * propiedad con un único 5 estrellas.
   */
  async bestRated(range: StatsRange) {
    const raw = await this.ratingRepo
      .createQueryBuilder('r')
      .select('r.propertyId', 'propertyId')
      .addSelect('COUNT(*)', 'count')
      .addSelect('AVG(r.score)', 'average')
      .groupBy('r.propertyId')
      .having('COUNT(*) >= 2')
      .orderBy('AVG(r.score)', 'DESC')
      .addOrderBy('COUNT(*)', 'DESC')
      .limit(TOP_N)
      .getRawMany<{ propertyId: number; count: string; average: string }>();

    return {
      range,
      rangeApplies: false,
      minRatings: 2,
      data: await this.decorateProperties(
        raw.map((r) => ({
          propertyId: Number(r.propertyId),
          count: Number(r.count),
          average: Number(Number(r.average).toFixed(2)),
        })),
      ),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 6. PROPIEDADES MÁS VISITADAS
  // ═══════════════════════════════════════════════════════════
  async mostViewed(range: StatsRange) {
    const since = rangeToDate(range);
    const raw = await this.viewRepo
      .createQueryBuilder('v')
      .select('v."propertyId"', 'propertyId')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COUNT(DISTINCT v."visitorId")', 'unique')
      .where('v."createdAt" > :since', { since })
      .groupBy('v."propertyId"')
      .orderBy('COUNT(*)', 'DESC')
      .limit(TOP_N)
      .getRawMany<{ propertyId: number; count: string; unique: string }>();

    const data = await this.decorateProperties(
      raw.map((r) => ({ propertyId: Number(r.propertyId), count: Number(r.count) })),
    );

    // Se agrega el conteo de visitantes únicos: 50 vistas de 3 personas no es
    // lo mismo que 50 vistas de 50 personas.
    return {
      range,
      rangeApplies: true,
      data: data.map((d, i) => ({ ...d, uniqueVisitors: Number(raw[i]?.unique ?? 0) })),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 7. TRÁFICO
  // ═══════════════════════════════════════════════════════════
  /**
   * Mismas reglas que la tarjeta de visitantes (`visitors.ts`): sin el admin
   * ni sus navegadores, sin visitas sin cookie y sin recargas de la misma
   * página dentro de los 30 minutos. Así el gráfico, el ranking de páginas y
   * la tarjeta no pueden mostrar números que se contradigan.
   */
  async traffic(range: StatsRange) {
    const params = realVisitsParams({ from: rangeToDate(range), to: new Date() });

    const [totales] = await this.visitRepo.query<
      { unicos: string; visitas: string; logueados: string }[]
    >(
      `SELECT COUNT(DISTINCT r."visitorId") AS unicos,
              COUNT(*) FILTER (WHERE r."countsAsView") AS visitas,
              COUNT(DISTINCT r."userId") AS logueados
       FROM (${REAL_VISITS_SQL}) r`,
      params,
    );

    // Serie por día para el gráfico de barras.
    const serie = await this.visitRepo.query<{ dia: string; visitas: string; unicos: string }[]>(
      `SELECT TO_CHAR(DATE_TRUNC('day', r."createdAt"), 'YYYY-MM-DD') AS dia,
              COUNT(*) FILTER (WHERE r."countsAsView") AS visitas,
              COUNT(DISTINCT r."visitorId") AS unicos
       FROM (${REAL_VISITS_SQL}) r
       GROUP BY 1
       ORDER BY 1 ASC`,
      params,
    );

    const paginas = await this.visitRepo.query<{ path: string; count: string }[]>(
      `SELECT r.path, COUNT(*) FILTER (WHERE r."countsAsView") AS count
       FROM (${REAL_VISITS_SQL}) r
       GROUP BY r.path
       ORDER BY 2 DESC
       LIMIT ${TOP_N}`,
      params,
    );

    const unicos = Number(totales?.unicos ?? 0);
    const logueados = Number(totales?.logueados ?? 0);
    return {
      range,
      totalVisitas: Number(totales?.visitas ?? 0),
      visitantesUnicos: unicos,
      visitantesLogueados: logueados,
      visitantesAnonimos: Math.max(unicos - logueados, 0),
      porDia: serie.map((s) => ({
        dia: s.dia,
        visitas: Number(s.visitas),
        unicos: Number(s.unicos),
      })),
      paginasMasVistas: this.toRows(
        new Map(paginas.map((p) => [p.path, Number(p.count)])),
      ),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 7.b VISITANTES — tarjeta "X personas visitaron Cerca Trova"
  // ═══════════════════════════════════════════════════════════
  /** Personas y páginas vistas de un período (reglas en `visitors.ts`). */
  private async visitorSummary(period: Period) {
    const [row] = await this.visitRepo.query<{ unicos: string; vistas: string }[]>(
      `SELECT COUNT(DISTINCT r."visitorId") AS unicos,
              COUNT(*) FILTER (WHERE r."countsAsView") AS vistas
       FROM (${REAL_VISITS_SQL}) r`,
      realVisitsParams(period),
    );
    const uniqueVisitors = Number(row?.unicos ?? 0);
    const pageViews = Number(row?.vistas ?? 0);
    return {
      uniqueVisitors,
      pageViews,
      pagesPerVisitor: pagesPerVisitor(pageViews, uniqueVisitors),
    };
  }

  /**
   * Día = HOY (desde las 00:00 de Argentina), semana = últimos 7 días, mes =
   * últimos 30, cada uno comparado con el período anterior equivalente.
   */
  async visitors(range: StatsRange) {
    const periods = visitorPeriods(range);
    const [current, previous] = await Promise.all([
      this.visitorSummary(periods.current),
      this.visitorSummary(periods.previous),
    ]);
    return {
      range,
      period: { label: periods.label, ...periods.current },
      ...current,
      previous: { label: periods.previousLabel, ...periods.previous, ...previous },
      change: {
        uniqueVisitors: percentChange(current.uniqueVisitors, previous.uniqueVisitors),
        pageViews: percentChange(current.pageViews, previous.pageViews),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 8. REGISTROS DE USUARIOS
  // ═══════════════════════════════════════════════════════════
  async registrations(range: StatsRange) {
    const since = rangeToDate(range);

    const raw = await this.userRepo
      .createQueryBuilder('u')
      .select('u."authProvider"', 'provider')
      .addSelect('COUNT(*)', 'count')
      .where('u.createdAt > :since', { since })
      .groupBy('u."authProvider"')
      .getRawMany<{ provider: string; count: string }>();

    const etiquetas: Record<string, string> = {
      local: 'Formulario del sitio',
      google: 'Google',
    };

    const counts = new Map<string, number>(
      raw.map((r) => [etiquetas[r.provider] ?? r.provider, Number(r.count)]),
    );
    const total = [...counts.values()].reduce((a, b) => a + b, 0);

    return { range, total, porMetodo: this.toRows(counts, 5) };
  }

  // ═══════════════════════════════════════════════════════════
  // 9. SOLICITUDES DE PUBLICACIÓN
  // ═══════════════════════════════════════════════════════════
  async propertyRequests(range: StatsRange) {
    const since = rangeToDate(range);

    const raw = await this.requestRepo
      .createQueryBuilder('r')
      .select('r.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('r.createdAt > :since', { since })
      .groupBy('r.status')
      .getRawMany<{ status: string; count: string }>();

    const etiquetas: Record<string, string> = {
      enviado: 'Enviadas',
      en_revision: 'En revisión',
      aceptado: 'Aceptadas',
      rechazado: 'Rechazadas',
    };

    const counts = new Map<string, number>(
      raw.map((r) => [etiquetas[r.status] ?? r.status, Number(r.count)]),
    );

    return {
      range,
      total: [...counts.values()].reduce((a, b) => a + b, 0),
      porEstado: this.toRows(counts, 6),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 10. TIEMPO PROMEDIO EN LA PÁGINA
  // ═══════════════════════════════════════════════════════════
  async averageTime(range: StatsRange) {
    const since = rangeToDate(range);

    // Solo visitas cerradas (con duración informada) y sin contar al admin.
    const base = () =>
      this.visitRepo
        .createQueryBuilder('v')
        .where('v."createdAt" > :since', { since })
        .andWhere('v."isAdmin" = false')
        .andWhere('v."durationMs" IS NOT NULL');

    const agg = await base()
      .select('AVG(v."durationMs")', 'promedio')
      .addSelect('COUNT(*)', 'muestras')
      .getRawOne<{ promedio: string; muestras: string }>();

    const porPagina = await base()
      .select('v.path', 'path')
      .addSelect('AVG(v."durationMs")', 'promedio')
      .addSelect('COUNT(*)', 'muestras')
      .groupBy('v.path')
      .orderBy('AVG(v."durationMs")', 'DESC')
      .limit(TOP_N)
      .getRawMany<{ path: string; promedio: string; muestras: string }>();

    const aSegundos = (ms: string | number) => Math.round(Number(ms ?? 0) / 1000);

    return {
      range,
      promedioSegundos: aSegundos(agg?.promedio ?? 0),
      muestras: Number(agg?.muestras ?? 0),
      porPagina: porPagina.map((p) => ({
        label: p.path,
        segundos: aSegundos(p.promedio),
        muestras: Number(p.muestras),
      })),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 11. INVENTARIO PROPIO  (no depende del tracking)
  // ═══════════════════════════════════════════════════════════
  /**
   * A diferencia del resto, esto NO mide qué buscan los usuarios sino qué hay
   * cargado en el catálogo. Es un conteo directo sobre `Property`, y el rango
   * de fechas se aplica sobre `created_at` de la propiedad (cuándo se cargó).
   */
  async ownInventory(range: StatsRange) {
    const since = rangeToDate(range);

    const base = () =>
      this.propertyRepo.createQueryBuilder('p').where('p.created_at > :since', { since });

    const totalEnRango = await base().getCount();
    const totalHistorico = await this.propertyRepo.count();

    const porTipo = await base()
      .leftJoin('p.typeOfProperty', 'type')
      .select('type.name', 'label')
      .addSelect('COUNT(*)', 'count')
      .groupBy('type.name')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany<{ label: string; count: string }>();

    const porOperacion = await base()
      .select('p."operationType"', 'label')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p."operationType"')
      .getRawMany<{ label: string; count: string }>();

    const agrupar = async (columna: string) =>
      base()
        .select(`p.${columna}`, 'label')
        .addSelect('COUNT(*)', 'count')
        .groupBy(`p.${columna}`)
        .orderBy('COUNT(*)', 'DESC')
        .limit(TOP_N)
        .getRawMany<{ label: string; count: string }>();

    const [porZona, porLocalidad, porBarrio] = await Promise.all([
      agrupar('zone'),
      agrupar('localidad'),
      agrupar('barrio'),
    ]);

    const aMapa = (rows: { label: string; count: string }[]) =>
      new Map(rows.map((r) => [r.label ?? 'Sin especificar', Number(r.count)]));

    return {
      range,
      totalEnRango,
      totalHistorico,
      porTipo: this.toRows(aMapa(porTipo)),
      porOperacion: this.toRows(aMapa(porOperacion), 5),
      porZona: this.toRows(aMapa(porZona)),
      porLocalidad: this.toRows(aMapa(porLocalidad)),
      porBarrio: this.toRows(aMapa(porBarrio)),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // RESUMEN — todo junto en una sola llamada
  // ═══════════════════════════════════════════════════════════
  /**
   * Devuelve TODAS las secciones de una. El dashboard las muestra juntas, así
   * que pedirlas en un solo request evita 11 llamadas en paralelo al abrir la
   * página.
   */
  async overview(range: StatsRange) {
    const [
      busquedas, operacion, favoritas, comentadas,
      valoradas, visitadas, trafico, registros,
      solicitudes, tiempo, inventario,
    ] = await Promise.all([
      this.searchedFeatures(range),
      this.operationTypeDemand(range),
      this.mostFavorited(range),
      this.mostCommented(range),
      this.bestRated(range),
      this.mostViewed(range),
      this.traffic(range),
      this.registrations(range),
      this.propertyRequests(range),
      this.averageTime(range),
      this.ownInventory(range),
    ]);

    return {
      range,
      generadoEn: new Date().toISOString(),
      busquedas, operacion, favoritas, comentadas,
      valoradas, visitadas, trafico, registros,
      solicitudes, tiempo, inventario,
    };
  }
}
