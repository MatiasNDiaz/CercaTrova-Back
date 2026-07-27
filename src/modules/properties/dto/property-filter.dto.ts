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
  @IsOptional()
  @IsString()
  title?: string;

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
  minM2?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxM2?: number;

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

  // En property-filter.dto.ts
  @IsOptional()
  @IsString()
  search?: string; // <--- Este recibirá "casa en la falda con patio..."
}