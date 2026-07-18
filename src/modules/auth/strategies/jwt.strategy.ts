// src/modules/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from 'src/modules/users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const cookieExtractor = (req: Request): string | null => {
      return req?.cookies?.access_token || null;
    };
    // 🔒 SEGURIDAD (C9): la app no debe arrancar sin JWT_SECRET
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET no está definido en el .env — abortando el arranque');
    }
    super({
      jwtFromRequest: cookieExtractor, // lee la cookie
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  // 🔒 SEGURIDAD (punto 14): validate() consulta la DB en cada request.
  // Si el usuario fue eliminado, el token deja de servir al instante; y el
  // role sale SIEMPRE de la DB (no del payload), así un cambio de rol tiene
  // efecto inmediato sin esperar a que expire el token viejo.
  async validate(payload: any) {
    const user = await this.usersService
      .getUserById(payload.sub)
      .catch(() => null);

    if (!user) {
      throw new UnauthorizedException('Sesión inválida');
    }

    // 🔒 SEGURIDAD (punto 15): si el tokenVersion del payload no coincide
    // con el actual de la DB, el token fue revocado (logout / cambio de
    // password) — se rechaza aunque no haya expirado todavía
    if (payload.tokenVersion !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException('Sesión inválida');
    }

    return { id: user.id, email: user.email, role: user.role };
  }
}
