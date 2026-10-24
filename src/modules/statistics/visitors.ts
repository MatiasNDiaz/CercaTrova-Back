import { StatsRange } from './dto/statistics-query.dto';

/**
 * Tarjeta "X personas visitaron Cerca Trova": períodos y cálculos puros.
 *
 * ── Cómo se cuenta (criterio documentado) ───────────────────────────────────
 * · Fuente: `page_visits`, que registra el NAVEGADOR (`VisitTracker`) en cada
 *   cambio de página, con la cookie anónima `ct_vid` (UUID, dura 1 año).
 * · PERSONA = un `visitorId` distinto (un navegador / dispositivo). Se cuenta
 *   sobre TODO el período (`COUNT(DISTINCT)`), nunca sumando los únicos de
 *   cada día: el que entra lunes y martes es 1 persona en la semana, no 2.
 *   Límite honesto: la misma persona en el celular y en la compu son 2.
 * · PÁGINA VISTA = una apertura de página. Una RECARGA de la misma página por
 *   el mismo visitante dentro de los 30 minutos siguientes NO suma otra.
 *   (Se calcula al consultar, no se borra nada: los datos crudos siguen
 *   intactos y el criterio se puede cambiar.)
 * · Se excluyen:
 *   - las visitas del admin logueado (`isAdmin`) y TODAS las de los
 *     navegadores donde alguna vez entró un admin (su compu/celular, aunque
 *     esté deslogueado);
 *   - las visitas sin cookie (`visitorId = 'desconocido'`);
 *   - los bots por user-agent: ya no se registran (ver `isBotUserAgent`).
 *     Las visitas anteriores a ese filtro no guardaron el user-agent, así
 *     que el histórico no se puede depurar de bots.
 */
export const RELOAD_WINDOW_MINUTES = 30;

/** Argentina es UTC-3 todo el año (sin horario de verano). */
const AR_OFFSET_MS = -3 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface Period {
  from: Date;
  to: Date;
}

export interface VisitorPeriods {
  current: Period;
  previous: Period;
  /** Período en la tarjeta: "Hoy", "Últimos 7 días", "Últimos 30 días". */
  label: string;
  /** Con qué se compara: "ayer a esta hora", "los 7 días anteriores"… */
  previousLabel: string;
}

/** Medianoche de HOY en Argentina, como instante absoluto. */
export function startOfTodayAR(now: Date): Date {
  const localMs = now.getTime() + AR_OFFSET_MS;
  const localMidnight = Math.floor(localMs / DAY) * DAY;
  return new Date(localMidnight - AR_OFFSET_MS);
}

/**
 * - Día: HOY desde las 00:00 (hora argentina) hasta ahora; se compara con
 *   AYER en el mismo tramo (00:00 → misma hora), así no se compara medio día
 *   contra un día entero.
 * - Semana / mes: los últimos 7 / 30 días contra los 7 / 30 anteriores.
 */
export function visitorPeriods(
  range: StatsRange,
  now = new Date(),
): VisitorPeriods {
  if (range === StatsRange.DAY) {
    const from = startOfTodayAR(now);
    return {
      current: { from, to: now },
      previous: {
        from: new Date(from.getTime() - DAY),
        to: new Date(now.getTime() - DAY),
      },
      label: 'Hoy',
      previousLabel: 'ayer a esta hora',
    };
  }
  const days = range === StatsRange.WEEK ? 7 : 30;
  const span = days * DAY;
  return {
    current: { from: new Date(now.getTime() - span), to: now },
    previous: {
      from: new Date(now.getTime() - 2 * span),
      to: new Date(now.getTime() - span),
    },
    label: `Últimos ${days} días`,
    previousLabel: `los ${days} días anteriores`,
  };
}

/** Páginas vistas por persona, con un decimal. null si no hubo visitantes. */
export function pagesPerVisitor(
  pageViews: number,
  uniqueVisitors: number,
): number | null {
  if (!uniqueVisitors) return null;
  return Math.round((pageViews / uniqueVisitors) * 10) / 10;
}

/**
 * Variación porcentual (entera) respecto del período anterior. null si el
 * anterior fue 0: "subió un ∞ %" no informa nada.
 */
export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Visitas REALES de un período, con la marca `countsAsView` (false = recarga
 * de la misma página dentro de los 30 minutos). Parámetros:
 *   $1 = inicio del período menos 30 min (para ver la visita anterior a una
 *        recarga que cae justo al empezar el período),
 *   $2 = inicio del período, $3 = fin del período.
 */
export const REAL_VISITS_SQL = `
  SELECT v."visitorId", v."userId", v.path, v."createdAt",
         (v.prev IS NULL OR v."createdAt" - v.prev > interval '${RELOAD_WINDOW_MINUTES} minutes') AS "countsAsView"
  FROM (
    SELECT p."visitorId", p."userId", p.path, p."createdAt",
           LAG(p."createdAt") OVER (PARTITION BY p."visitorId", p.path ORDER BY p."createdAt") AS prev
    FROM page_visits p
    WHERE p."createdAt" >= $1 AND p."createdAt" < $3
      AND p."isAdmin" = false
      AND p."visitorId" <> 'desconocido'
      AND NOT EXISTS (
        SELECT 1 FROM page_visits a
        WHERE a."visitorId" = p."visitorId" AND a."isAdmin" = true
      )
  ) v
  WHERE v."createdAt" >= $2`;

/** Los tres parámetros de `REAL_VISITS_SQL` para un período. */
export function realVisitsParams(period: Period): [Date, Date, Date] {
  return [
    new Date(period.from.getTime() - RELOAD_WINDOW_MINUTES * 60 * 1000),
    period.from,
    period.to,
  ];
}
