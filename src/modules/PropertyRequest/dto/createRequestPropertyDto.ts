// src/modules/PropertyRequest/dto/createRequestPropertyDto.ts
import { IsString, IsNumber, IsBoolean, IsOptional, Min, IsNotEmpty, IsEnum } from 'class-validator';
import {
  TipoPropiedadRequest,
  TipoOperacionRequest,
  EstadoConservacionRequest,
} from './enumsPropertyRequest';

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

  // (ERROR_FIXES): antes eran @IsString() libre — se guardaban valores
  // arbitrarios inconsistentes con las stats y con Property
  @IsEnum(TipoPropiedadRequest, {
    message: `tipoPropiedad inválido. Valores permitidos: ${Object.values(TipoPropiedadRequest).join(', ')}`,
  })
  tipoPropiedad: TipoPropiedadRequest;

  @IsEnum(TipoOperacionRequest, {
    message: `tipoOperacion inválido. Valores permitidos: ${Object.values(TipoOperacionRequest).join(', ')}`,
  })
  tipoOperacion: TipoOperacionRequest;

  @IsEnum(EstadoConservacionRequest, {
    message: `estadoConservacion inválido. Valores permitidos: ${Object.values(EstadoConservacionRequest).join(', ')}`,
  })
  estadoConservacion: EstadoConservacionRequest;

  @IsNumber()
  @Min(0)
  m2Totales: number;

  @IsNumber()
  @Min(0)
  m2Cubiertos: number;

  @IsNumber()
  @Min(0)
  habitaciones: number;

  @IsNumber()
  @Min(0)
  baños: number;

  @IsNumber()
  @Min(0)
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