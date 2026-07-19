// src/modules/users/dto/create-user.dto.ts
import { Transform } from 'class-transformer';
import { IsString, IsEmail, IsOptional, MinLength } from 'class-validator';

export class CreateUserDto {

  // Nota: los @Transform tenían llaves sin return y devolvían undefined,
  // lo que hacía fallar TODA validación de este DTO (endpoint roto)
  @Transform(({ value }) => value?.trim())
  @IsString()
  name: string;

  @Transform(({ value }) => value?.trim())
  @IsString()
  surname: string;

  @Transform(({ value }) => value?.trim())
  @IsString() // Mejor usar string por posibles ceros o códigos de país
  phone: string;

  @IsOptional()
  @IsString()
  photo?: string;

  @Transform(({ value }) => value?.trim().toLowerCase())
  @IsEmail()
  email: string;
  
  @Transform(({ value }) => value?.trim())
  @IsString()
  @MinLength(5) // (ERROR_FIXES): igualado a RegisterDto — antes aceptaba cualquier largo
  password: string;

  // 🔒 SEGURIDAD (C1): el campo `role` fue eliminado de este DTO.
  // El rol se asigna siempre por default en la entidad (Role.USER);
  // nunca debe aceptarse desde el body de un endpoint público.
}
