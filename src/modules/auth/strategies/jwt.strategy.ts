// src/modules/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config'; // <-- Asegúrate de que esta importación esté correcta
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    
    // 1. EL CONSTRUCTOR DEBE RECIBIR UNA INSTANCIA:
    constructor(private configService: ConfigService) {
    
        const cookieExtractor = (req: Request): string | null => {
      return req?.cookies?.access_token || null;
    };
    super({
    jwtFromRequest: cookieExtractor, // ahora lee la cookie
    ignoreExpiration: false,
    secretOrKey: configService.get<string>('JWT_SECRET'),
    });

    }

    async validate(payload: any) {
    return { id: payload.sub, email: payload.email, role: payload.role };
    }


}