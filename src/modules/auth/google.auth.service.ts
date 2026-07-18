// src/modules/auth/google-auth.service.ts
import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleAuthService {
  private client: OAuth2Client;
  private readonly clientId: string;

  constructor(private readonly configService: ConfigService) {
    // 🔒 SEGURIDAD (C7): si GOOGLE_CLIENT_ID falta, google-auth-library omite
    // la validación de audience y aceptaría idTokens emitidos para CUALQUIER
    // otra aplicación. La app no debe arrancar sin esta variable.
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new Error(
        'GOOGLE_CLIENT_ID no está definido en el .env — abortando el arranque',
      );
    }
    this.clientId = clientId;
    this.client = new OAuth2Client(clientId);
  }

  async verifyIdToken(idToken: string) {
    let payload;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      payload = ticket.getPayload();
    } catch (error) {
      throw new BadRequestException('No se pudo verificar el token de Google');
    }

    if (!payload || !payload.email) {
      throw new BadRequestException('Token inválido');
    }

    // 🔒 SEGURIDAD (C7): defensa en profundidad — validamos el audience
    // explícitamente además de pasarlo a verifyIdToken()
    if (payload.aud !== this.clientId) {
      throw new UnauthorizedException(
        'El token no fue emitido para esta aplicación',
      );
    }

    // 🔒 SEGURIDAD (C7): solo se aceptan cuentas con email verificado por
    // Google — sin esto, vincular por email permite tomar cuentas ajenas
    if (payload.email_verified !== true) {
      throw new UnauthorizedException(
        'El email de la cuenta de Google no está verificado',
      );
    }

    // Retornamos la info útil del usuario
    return {
      email: payload.email,
      name: payload.given_name,
      surname: payload.family_name,
      photo: payload.picture,
    };
  }
}
