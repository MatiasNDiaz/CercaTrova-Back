import { Type } from 'class-transformer';
import { IsOptional, IsInt, IsBooleanString, IsString } from 'class-validator';

export class PropertyFilterDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsInt()
  rooms?: number;

  @IsOptional()
  @IsInt()
  bathrooms?: number;

  @IsOptional()
  @IsBooleanString()
  garage?: string; // "true" | "false"

  @IsOptional()
  @IsBooleanString()
  patio?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  minPrice?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  maxPrice?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  typeOfPropertyId?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
