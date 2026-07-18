// src/modules/auth/dto/login-auth.dto.ts
import { IsString, IsEmail, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

// (B8): se eliminó el campo `id` (el cliente no debe poder mandarlo) y se
// unificó MinLength(5) con RegisterDto (antes login aceptaba 4)
export class LoginDto {
  @Transform(({ value }) => value?.trim().toLowerCase())
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(5)
  password: string;
}
