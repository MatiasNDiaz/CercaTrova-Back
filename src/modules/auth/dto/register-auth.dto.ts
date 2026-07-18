// src/modules/auth/dto/register-auth.dto.ts
import { IsString, IsEmail, IsOptional, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

// (B8): se eliminaron `id`, `createdAt` y `updatedAt` — los genera la DB y
// el cliente no debe poder mandarlos
export class RegisterDto {
  @IsString()
  name: string;

  @IsString()
  surname: string;

  @IsString() // Mejor usar string por posibles ceros o códigos de país
  phone: string;

  @IsOptional()
  @IsString()
  photo?: string;

  @Transform(({ value }) => value?.trim().toLowerCase())
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(5)
  password: string;
}
