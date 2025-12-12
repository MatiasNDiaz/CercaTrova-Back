import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  IsUUID,
  IsEnum,
} from 'class-validator';
import { operationType, propertyType } from './enumsRequest';

export class CreateUserSearchFeedbackDto {
  
  @IsOptional()
  @IsNumber()
  rooms?: number;

  @IsOptional()
  @IsNumber()
  bathrooms?: number;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsNumber()
  priceMin?: number;

  @IsOptional()
  @IsNumber()
  priceMax?: number;

  @IsOptional()
  @IsEnum(propertyType)
  propertyType?: propertyType;

  @IsOptional()
  @IsEnum(operationType)
  operationType?: operationType;
 // "alquiler" | "venta"

  @IsOptional()
  @IsNumber()
  antiquityMin?: number;

  @IsOptional()
  @IsNumber()
  antiquityMax?: number;

  @IsOptional()
  @IsBoolean()
  hasGarage?: boolean;

  @IsOptional()
  @IsBoolean()
  hasPatio?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  // ⚠️ Obligatorio para evitar spam
  @IsString()
  @IsUUID('4')
  deviceId: string;
}
