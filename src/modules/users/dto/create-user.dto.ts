// src/modules/users/dto/create-user.dto.ts
import { IsString, IsEmail, IsOptional, IsBoolean, IsDate, IsNumber } from 'class-validator';

export class CreateUserDto {
  @IsOptional() // Se genera automáticamente en la DB
  @IsNumber()
  id?: number;

  @IsString()
  name: string;

  @IsString()
  surname: string;

  @IsString() // Mejor usar string por posibles ceros o códigos de país
  phone: string;

  @IsOptional()
  @IsString()
  photo?: string;

  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @IsOptional()
  @IsDate()
  createdAt?: Date;

  @IsOptional()
  @IsDate()
  updatedAt?: Date;
}
