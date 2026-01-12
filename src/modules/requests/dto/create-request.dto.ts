import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
} from 'class-validator';


export enum OperationType {
  ALQUILER = "alquiler",
  VENTA = "venta",
}

// Nota: Aunque aquí usamos enum para estadísticas rápidas, 
// el Admin verá tendencias de qué tipos se piden más.
export enum PropertyTypeEnum {
  CASA = "casa",
  DEPARTAMENTO = "departamento",
  TERRENO = "terreno",
  LOCAL = "local",
  OFICINA = "oficina"
}

export class CreateUserSearchFeedbackDto {
  @IsOptional() @IsNumber() rooms?: number;
  @IsOptional() @IsNumber() bathrooms?: number;
  @IsOptional() @IsString() zone?: string;
  @IsOptional() @IsString() localidad?: string; // Sincronizado
  @IsOptional() @IsString() barrio?: string;    // Sincronizado
  
  @IsOptional() @IsNumber() priceMin?: number;
  @IsOptional() @IsNumber() priceMax?: number;

  @IsOptional() @IsEnum(PropertyTypeEnum) propertyType?: PropertyTypeEnum;
  @IsOptional() @IsEnum(OperationType) operationType?: OperationType;

  @IsOptional() @IsNumber() antiquityMax?: number;
  @IsOptional() @IsBoolean() hasGarage?: boolean;
  @IsOptional() @IsBoolean() hasPatio?: boolean;
  @IsOptional() @IsString() notes?: string;

  @IsString() @IsUUID('4') deviceId: string;}