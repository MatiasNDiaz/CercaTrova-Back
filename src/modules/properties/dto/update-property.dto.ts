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
import { OperationType, StatusProperty } from './enumsStatusProperty';

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
  zone?: string;

  @IsOptional()
  @IsBoolean()
  property_deed?: boolean;

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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  antiquity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  m2?: number;

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