import { IsString, IsNumber, IsBoolean, IsOptional, IsArray, IsEnum, Min } from 'class-validator';

export class CreateRequestPropertyDto {
  // --- Ubicación ---
  @IsString()
  localidad: string;

  @IsString()
  barrio: string;

  // --- Características Técnicas ---
  @IsString()
  tipoPropiedad: string;

  @IsString()
  tipoOperacion: string; // Venta o Alquiler

  @IsString()
  estadoConservacion: string; // Excelente, Bueno, A refaccionar

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

  // --- Booleanos (Switches en el Front) ---
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

  // --- Comercial y Notas ---
  @IsNumber()
  @Min(0)
  precioEstimado: number;

  @IsOptional()
  @IsString()
  mensajeAgente?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}