import { IsOptional, IsString, IsNumber, IsBoolean, IsEnum, Min } from 'class-validator';
import { typeOfProperty } from './enumTypeOfProperty';

export class CreateSearchPreferenceDto {
  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsEnum(typeOfProperty)
  typeOfProperty?: typeOfProperty;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minRooms?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  m2?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minBathrooms?: number;

  @IsOptional()
  @IsBoolean()
  notifyNewMatches?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyPriceDrops?: boolean;
}
