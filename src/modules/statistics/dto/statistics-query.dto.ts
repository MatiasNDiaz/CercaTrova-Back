import { IsEnum, IsOptional } from 'class-validator';

/** Ventana temporal sobre la que se recalcula cada sección. */
export enum StatsRange {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class StatisticsQueryDto {
  @IsOptional()
  @IsEnum(StatsRange, {
    message: `range inválido. Valores permitidos: ${Object.values(StatsRange).join(', ')}`,
  })
  range?: StatsRange = StatsRange.MONTH;
}

/** Fecha de corte según el rango: todo lo posterior entra en el cálculo. */
export function rangeToDate(range: StatsRange = StatsRange.MONTH): Date {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  switch (range) {
    case StatsRange.DAY:
      return new Date(now - DAY);
    case StatsRange.WEEK:
      return new Date(now - 7 * DAY);
    case StatsRange.MONTH:
    default:
      return new Date(now - 30 * DAY);
  }
}
