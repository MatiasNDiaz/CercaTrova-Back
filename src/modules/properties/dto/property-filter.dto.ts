// src/modules/properties/dto/property-filter.dto.ts
import { Type } from 'class-transformer';
import { IsOptional, IsInt, IsBooleanString, IsString, Min, Max } from 'class-validator';

export class PropertyFilterDto {
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
  hasDeed?: string; // Para el campo property_deed de la entidad

  // --- ESTADO ---
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  provincia?: string;

  @IsOptional()
  @IsString()
  localidad?: string;

  @IsOptional()
  @IsString()
  barrio?: string;
}