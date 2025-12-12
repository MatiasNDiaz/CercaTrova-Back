import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  IsInt,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StatusProperty } from './enumsStatusProperty';

export class CreatePropertyDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @Type(() => Number)
  @IsInt()
  typeOfPropertyId: number;

  @IsString()
  @IsNotEmpty()
  zone: string;

  @Type(() => Number)
  @IsNumber()
  rooms: number;

  @Type(() => Number)
  @IsNumber()
  bathrooms: number;

  @Type(() => Boolean)
  @IsBoolean()
  garage: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  patio: boolean;
  
  @Type(() => Number)
  @IsNumber()
  m2: number;

  @Type(() => Number)
  @IsNumber()
  antiquity: number;

  @Type(() => Number)
  @IsNumber()
  price: number;

  @IsEnum(StatusProperty)
  @IsNotEmpty()
  status: StatusProperty;
}
