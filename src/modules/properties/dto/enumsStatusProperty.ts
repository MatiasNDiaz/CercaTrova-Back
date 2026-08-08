export enum StatusProperty {
    DISPONIBLE = 'disponible',
    PENDIENTE = 'pendiente',
    VENDIDO = 'vendida',
    ALQUILADA = 'alquilada',
    ELIMINADO = 'eliminado',
    PAUSADO = 'en pausa',
}

export enum OperationType {
  VENTA = 'venta',
  ALQUILER = 'alquiler',
  ALQUILER_TEMPORAL = 'temporal',
}

/**
 * Moneda en la que está expresado `Property.price`.
 *
 * El default es USD y no ARS a propósito: todo el catálogo cargado hasta ahora
 * está en dólares (el precio se mostraba con un "USD" hardcodeado en el
 * frontend, sin columna que lo respaldara). Con el default en USD, las filas
 * viejas quedan correctas sin necesidad de backfill.
 *
 * ⚠️ NO aplica a `expensas`, que son SIEMPRE en pesos — ver el docstring de esa
 * columna en `property.entity.ts`.
 */
export enum Currency {
  ARS = 'ARS',
  USD = 'USD',
}