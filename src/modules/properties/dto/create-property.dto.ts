import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  IsInt,
  IsEnum,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency, OperationType, StatusProperty } from './enumsStatusProperty';

export class CreatePropertyDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @Type(() => Number)
  @IsInt()
  typeOfPropertyId!: number;
// En create-property.dto.ts

  @IsEnum(OperationType)
  @IsNotEmpty()
  operationType!: OperationType;

  // Documentación legal: independientes entre sí (pueden convivir)
  @IsBoolean()
  property_deed!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  tractoAbreviado!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  boleto!: boolean;

  @IsString()
  @IsNotEmpty()
  provincia!: string; // Ej: "Córdoba"

  @IsString()
  @IsNotEmpty()
  localidad!: string; // Ej: "Villa Carlos Paz"

  @IsString()
  @IsNotEmpty()
  barrio!: string;    // Ej: "La Cuesta"

  @IsString()
  @IsNotEmpty()
  direccion!: string; // Ej: "Av. San Martín 1250"

  @IsString()
  @IsNotEmpty()
  zone!: string;

  @Type(() => Number)
  @IsNumber()
  rooms!: number;

  @Type(() => Number)
  @IsNumber()
  bathrooms!: number;

  @Type(() => Boolean)
  @IsBoolean()
  garage!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  patio!: boolean;

  // Opcional: no bloquea la publicación si el admin no lo completa. Sin valor
  // el backend lo deja en `false` (default de la columna).
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  aptoMascotas?: boolean;

  /**
   * Expensas mensuales EN PESOS. Opcional — una casa no tiene expensas.
   *
   * `@Min(0)` porque un monto negativo no tiene sentido; el 0 sí es válido y
   * significa "sin expensas", distinto de no informarlas.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expensas?: number;

  @Type(() => Number)
  @IsNumber()
  supTotal!: number;

  @Type(() => Number)
  @IsNumber()
  supCubierta!: number;

  @Type(() => Number)
  @IsNumber()
  antiquity!: number;

  @Type(() => Number)
  @IsNumber()
  price!: number;

  /**
   * Moneda del precio. Opcional: si no viene, el inicializador de abajo la deja
   * en USD, que es lo que tenía todo el catálogo antes de que la columna
   * existiera.
   *
   * El default se declara como inicializador de propiedad y NO con un
   * `@Transform`: `JsonToDtoPipe` usa `plainToInstance`, que instancia la clase
   * de verdad, así que el inicializador corre y el campo llega poblado al
   * `propertyRepo.create(dto)` del service.
   */
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency = Currency.USD;

  @IsEnum(StatusProperty)
  @IsNotEmpty()
  status!: StatusProperty;
}
