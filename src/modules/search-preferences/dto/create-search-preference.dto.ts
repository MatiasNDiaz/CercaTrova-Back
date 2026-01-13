import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsEnum,
  Min,
  Max
} from 'class-validator';
import { OperationType } from 'src/modules/properties/dto/enumsStatusProperty';

export class CreateSearchPreferenceDto {
  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsString()
  localidad?: string; // Nuevo

  @IsOptional()
  @IsString()
  barrio?: string;    // Nuevo

  @IsOptional()
  @IsEnum(OperationType)
  operationType?: OperationType;

  @IsOptional()
  @IsBoolean()
  property_deed?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  typeOfPropertyId?: number;  // <- usar ID, no enum

  // ---------------------------
  // PRECIO (NUEVO MODELO)
  // ---------------------------
  @IsOptional()
  @IsNumber()
  @Min(0)
  preferredPrice?: number;

  // ---------------------------
  // RESTO
  // ---------------------------
  @IsOptional()
  @IsNumber()
  @Min(0)
  minRooms?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minBathrooms?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  m2?: number;

  // ---------------------------
  // ANTIGÜEDAD (NUEVO)
  // ---------------------------
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAntiquity?: number;

  // ---------------------------
  // FLAGS
  // ---------------------------
  @IsOptional()
  @IsBoolean()
  notifyNewMatches?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyPriceDrops?: boolean;
}
