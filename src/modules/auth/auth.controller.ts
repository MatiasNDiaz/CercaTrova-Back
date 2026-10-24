import { Controller, Get, Post, Body, Res, UseGuards, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register-auth.dto';
import { LoginDto } from './dto/login-auth.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { setAuthCookie, clearAuthCookie } from './auth-cookie.helper';
import type { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 🔒 SEGURIDAD (M9): límite estricto en endpoints de credenciales —
  // 5 intentos por minuto por IP (anti fuerza bruta)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() registerData: RegisterDto) {
    return this.authService.register(registerData);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() loginData: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.authService.login(loginData);
    // 🔒 SEGURIDAD (punto 13): la cookie se setea SOLO mediante el helper
    setAuthCookie(res, token);
    return { message: 'Login exitoso', user };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('google')
  async googleLogin(@Body() body: GoogleLoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.authService.googleLogin(body.idToken);
    setAuthCookie(res, token);
    return { message: 'Login con Google exitoso', user };
  }

  // Busca el usuario completo en la DB usando el sub (id) del token
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: any) {
    return this.authService.getMe(req.user.id);
  }

  /**
   * Borra la cookie de sesión de ESTE navegador, sin pedir sesión válida.
   *
   * Es la salida de emergencia de las pantallas de error del frontend
   * ("Volver a iniciar sesión"): si la sesión quedó en un estado raro, el
   * usuario no tiene que borrar cookies a mano. La cookie es httpOnly, así que
   * solo el backend puede borrarla.
   *
   * No revoca nada en el servidor (para eso está `logout`, que sí exige sesión):
   * solo limpia la cookie de quien lo llama — no afecta a ninguna otra sesión.
   */
  @Post('clear-session')
  clearSession(@Res({ passthrough: true }) res: Response) {
    clearAuthCookie(res);
    return { message: 'Sesión local limpiada' };
  }

  // 🔒 SEGURIDAD (punto 15): logout requiere sesión válida para poder
  // incrementar tokenVersion y revocar de verdad los tokens emitidos
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@GetUser('id') userId: number, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(userId);
    // 🔒 SEGURIDAD (punto 13): mismos atributos que el set — garantiza el borrado
    clearAuthCookie(res);
    return { message: 'Logout exitoso' };
  }
}
