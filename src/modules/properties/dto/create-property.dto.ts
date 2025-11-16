import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsUrl,
} from 'class-validator';

export class CreatePropertyDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  zone: string;

  @IsNumber()
  rooms: number;

  @IsNumber()
  bathrooms: number;

  @IsBoolean()
  garage: boolean;

  @IsBoolean()
  patio: boolean;

  @IsNumber()
  antiquity: number;

  @IsNumber()
  price: number;

  @IsString()
  @IsNotEmpty()
  status: string;

  @IsUrl()
  @IsNotEmpty()
  image_url: string;

  @IsUrl()
  @IsOptional()
  video_url?: string;
}
