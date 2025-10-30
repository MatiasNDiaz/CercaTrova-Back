// src/modules/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config'; // <-- Asegúrate de que esta importación esté correcta

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    
    // 1. EL CONSTRUCTOR DEBE RECIBIR UNA INSTANCIA:
    constructor(private configService: ConfigService) {
        super({
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        ignoreExpiration: false,
        // 2. USAMOS 'this.configService' (la instancia) para llamar al método 'get()'.
        secretOrKey: configService.get<string>('JWT_SECRET'), 
        });
    }

    async validate(payload: any) {
        return { id: payload.sub, email: payload.email, role: payload.role };
    }
}