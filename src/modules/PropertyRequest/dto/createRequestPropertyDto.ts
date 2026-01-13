// src/modules/PropertyRequest/dto/createRequestPropertyDto.ts
import { IsString, IsNumber, IsBoolean, IsOptional, Min, IsNotEmpty } from 'class-validator';

export class CreateRequestPropertyDto {
  @IsString()
  @IsNotEmpty()
  localidad: string;

  @IsString()
  @IsNotEmpty()
  barrio: string;

  @IsString()
  @IsNotEmpty()
  direccion: string; // Calle y Altura

  @IsOptional()
  @IsString()
  pisoDepto?: string;

  @IsString()
  tipoPropiedad: string;

  @IsString()
  tipoOperacion: string;

  @IsString()
  estadoConservacion: string;

  @IsNumber()
  @Min(0)
  m2Totales: number;

  @IsNumber()
  @Min(0)
  m2Cubiertos: number;

  @IsNumber()
  habitaciones: number;

  @IsNumber()
  baños: number;

  @IsNumber()
  antiguedad: number;

  @IsOptional()
  @IsString()
  orientacion?: string;

  @IsBoolean()
  patio: boolean;

  @IsBoolean()
  garage: boolean;

  @IsBoolean()
  escritura: boolean;

  @IsBoolean()
  impuestosAlDia: boolean;

  @IsBoolean()
  aptoCredito: boolean;

  @IsNumber()
  @Min(0)
  precioEstimado: number;

  @IsOptional()
  @IsString()
  mensajeAgente?: string;
}