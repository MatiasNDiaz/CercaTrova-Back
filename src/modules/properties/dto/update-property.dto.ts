import { IsString, IsNotEmpty, IsNumber, IsBoolean, IsOptional, IsUrl, Min } from 'class-validator';

export class UpdatePropertyDto {
  /** 🏠 Título de la propiedad */
  @IsString()
  @IsNotEmpty({ message: 'El título es obligatorio' })
  title: string;

  /** 📝 Descripción de la propiedad */
  @IsString()
  @IsNotEmpty({ message: 'La descripción es obligatoria' })
  description: string;

  /** 🏘️ Tipo de propiedad (casa, departamento, terreno, etc.) */
  @IsString()
  @IsNotEmpty({ message: 'El tipo es obligatorio' })
  type: string;

  /** 📍 Zona o ubicación general */
  @IsString()
  @IsNotEmpty({ message: 'La zona es obligatoria' })
  zone: string;

  /** 🚪 Cantidad de habitaciones */
  @IsNumber()
  @Min(0)
  rooms: number;

  /** 🚽 Cantidad de baños */
  @IsNumber()
  @Min(0)
  bathrooms: number;

  /** 🚗 Si tiene cochera o no */
  @IsBoolean()
  garage: boolean;

  /** 🌳 Si tiene patio o no */
  @IsBoolean()
  patio: boolean;

  /** ⏳ Antigüedad en años */
  @IsNumber()
  @Min(0)
  antiquity: number;

  /** 💵 Precio en dólares (o moneda local) */
  @IsNumber()
  @Min(0)
  price: number;

  /** 📦 Estado (disponible, reservado, vendido, etc.) */
  @IsString()
  @IsNotEmpty({ message: 'El estado es obligatorio' })
  status: string;

  /** 🖼️ URL de la imagen principal */
  @IsString()
  @IsUrl({}, { message: 'Debe ser una URL válida' })
  image_url: string;

  /** 🎥 URL del video (opcional) */
  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'Debe ser una URL válida' })
  video_url?: string;
}
