// src/modules/auth/dto/google-login.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

// (ERROR_FIXES R-24): antes se usaba @Body('idToken') suelto — un body vacío
// caía en el catch genérico de verifyIdToken en vez de dar un 400 claro.
export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty({ message: 'El idToken de Google es obligatorio' })
  idToken: string;
}
