import { 
  IsString, 
  IsNumber, 
  IsBoolean, 
  IsOptional, 
  IsInt, 
  Min, 
  IsEnum, 
  IsArray 
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency, OperationType, StatusProperty } from './enumsStatusProperty';

export class UpdatePropertyDto {
  @IsOptional()
  @IsString()
  title?: string; 

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(OperationType)
  operationType?: OperationType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  typeOfPropertyId?: number;

  @IsOptional()
  @IsString()
  provincia?: string;

  @IsOptional()
  @IsString()
  localidad?: string;

  @IsOptional()
  @IsString()
  barrio?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  zone?: string;

  // Documentación legal: independientes entre sí (pueden convivir)
  @IsOptional()
  @IsBoolean()
  property_deed?: boolean;

  @IsOptional()
  @IsBoolean()
  tractoAbreviado?: boolean;

  @IsOptional()
  @IsBoolean()
  boleto?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bathrooms?: number;

  @IsOptional()
  @IsBoolean()
  garage?: boolean;

  @IsOptional()
  @IsBoolean()
  patio?: boolean;

  @IsOptional()
  @IsBoolean()
  aptoMascotas?: boolean;

  /**
   * Expensas mensuales EN PESOS.
   *
   * `@IsOptional()` de class-validator saltea la validación tanto con
   * `undefined` como con `null`, así que mandar `expensas: null` es la forma de
   * BORRAR unas expensas ya cargadas: pasa la validación y llega al
   * `Object.assign` del service como null. Sin eso no habría manera de
   * desasignarlas una vez puestas.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expensas?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  antiquity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  // Sin default acá, a diferencia de create: en un PATCH, "no vino" significa
  // "no lo toques". Un default USD dejaría en dólares toda propiedad editada
  // desde un formulario que no mande el campo.
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  supTotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  supCubierta?: number;

  @IsOptional()
  @IsEnum(StatusProperty)
  status?: StatusProperty;

  // --- Campos especiales para la gestión de imágenes ---
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  deleteImages?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  setCoverImageId?: number;
}