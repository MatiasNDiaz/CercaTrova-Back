// src/modules/properties/dto/property-filter.dto.ts
import { Type } from 'class-transformer';
import { IsOptional, IsInt, IsBooleanString, IsString, Min, Max, IsEnum, IsIn } from 'class-validator';
import { OperationType, StatusProperty } from './enumsStatusProperty';

// Campos por los que el catálogo puede ordenar. `date` = fecha de publicación
// (created_at), `rating` = promedio de valoraciones (subconsulta AVG).
export enum PropertySortBy {
  PRICE = 'price',
  ANTIQUITY = 'antiquity',
  DATE = 'date',
  RATING = 'rating',
}

/**
 * Paginación de `GET /properties` (el listado simple, sin filtros).
 *
 * Va aparte de `PropertyFilterDto` a propósito: con `forbidNonWhitelisted`,
 * reusar el DTO de filtros haría que `GET /properties?localidad=X` aceptara un
 * criterio que ese endpoint no aplica. Acá solo se acepta lo que se usa.
 */
export class PropertyPaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export class PropertyFilterDto {
  // --- ORDENAMIENTO ---
  @IsOptional()
  @IsEnum(PropertySortBy)
  sortBy?: PropertySortBy;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC';

  // --- PAGINACIÓN (Clave para un Senior) ---
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  // --- FILTROS DE TEXTO ---
  // ❌ ELIMINADO: `title`. Estaba declarado pero `PropertiesService.filter()`
  // nunca lo desestructuraba ni lo usaba en ninguna condición — el DTO lo
  // aceptaba y devolvía 200 sin filtrar nada, así que el frontend podía creer
  // que funcionaba (verificado: mismos 10 resultados con y sin él).
  // La búsqueda por título ya la cubre `?search=`, que incluye `p.title` en su
  // bloque de búsqueda textual junto con localidad, barrio y descripción.
  // Se elimina en vez de implementarlo para no duplicar lo que hace `search`.

  @IsOptional()
  @IsString()
  zone?: string;

  // --- FILTROS NUMÉRICOS (Exactos) ---
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  rooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  bathrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  typeOfPropertyId?: number;

  // --- FILTROS DE RANGO (Precios y Metros) ---
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minSupTotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxSupTotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minSupCubierta?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxSupCubierta?: number;

  // Expensas mensuales EN PESOS (ver el docstring de la columna en la entidad).
  // ⚠️ Asimetría deliberada en cómo tratan los NULL — ver `filter()` en el
  // service: `maxExpensas` INCLUYE las propiedades sin expensas cargadas,
  // `minExpensas` las excluye.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minExpensas?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxExpensas?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxAntiquity?: number; // Ejemplo: "Casas de menos de 10 años"

  // --- FILTROS BOOLEANOS (Vienen como String desde la URL) ---
  @IsOptional()
  @IsBooleanString()
  garage?: string; // "true" | "false"

  @IsOptional()
  @IsBooleanString()
  patio?: string;

  @IsOptional()
  @IsBooleanString()
  property_deed?: string; // Para el campo property_deed de la entidad

  @IsOptional()
  @IsBooleanString()
  tractoAbreviado?: string;

  @IsOptional()
  @IsBooleanString()
  boleto?: string;

  // --- ESTADO ---
  // (ERROR_FIXES R-21): antes era @IsString() y un valor inválido devolvía
  // una lista vacía en silencio — ahora responde 400 claro
  @IsOptional()
  @IsEnum(StatusProperty, {
    message: `status inválido. Valores permitidos: ${Object.values(StatusProperty).join(', ')}`,
  })
  status?: StatusProperty;

  @IsOptional()
  @IsString()
  provincia?: string;

  @IsOptional()
  @IsString()
  localidad?: string;

  // En property-filter.dto.ts (Para que el usuario pueda filtrar por esto)
  @IsOptional()
  @IsEnum(OperationType)
  operationType?: OperationType;

  @IsOptional()
  @IsString()
  barrio?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  // En property-filter.dto.ts
  @IsOptional()
  @IsString()
  search?: string; // <--- Este recibirá "casa en la falda con patio..."
}