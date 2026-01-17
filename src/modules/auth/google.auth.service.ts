// src/modules/auth/google-auth.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class GoogleAuthService {
  private client: OAuth2Client;

  constructor() {
    this.client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

  async verifyIdToken(idToken: string) {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID, // tu client ID de Google
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new BadRequestException('Token inválido');
      }

      // Retornamos la info útil del usuario
      return {
        email: payload.email,
        name: payload.given_name,
        surname: payload.family_name,
        photo: payload.picture,
      };
    } catch (error) {
      throw new BadRequestException('No se pudo verificar el token de Google');
    }
  }
}
