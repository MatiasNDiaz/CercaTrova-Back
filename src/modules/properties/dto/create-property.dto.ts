import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  IsInt,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OperationType, StatusProperty } from './enumsStatusProperty';

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

  @IsEnum(StatusProperty)
  @IsNotEmpty()
  status!: StatusProperty;
}
