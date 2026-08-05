import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

/** Nombre de la cookie con el identificador anónimo de visitante. */
export const VISITOR_COOKIE = 'ct_vid';

/** Un año — la métrica de "visitantes únicos" necesita que sobreviva sesiones. */
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Garantiza que toda request traiga un identificador anónimo de visitante.
 *
 * Si la cookie no existe, genera un UUID y la setea. Es **httpOnly**: el
 * frontend nunca la lee ni la manipula, solo viaja sola en cada request
 * (axios va con `withCredentials: true`).
 *
 * 🔒 No guarda ningún dato personal: es un identificador opaco, sirve
 * únicamente para no contar diez veces al mismo visitante.
 */
@Injectable()
export class VisitorIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    let visitorId = req.cookies?.[VISITOR_COOKIE];

    if (!visitorId) {
      visitorId = randomUUID();
      res.cookie(VISITOR_COOKIE, visitorId, {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: ONE_YEAR_MS,
      });
      // Se expone en la request para que quien la atienda ya lo tenga
      // disponible sin esperar al próximo request.
      req.cookies = { ...(req.cookies ?? {}), [VISITOR_COOKIE]: visitorId };
    }

    next();
  }
}

/** Helper para leer el id de visitante desde un handler. */
export function getVisitorId(req: Request): string {
  return req.cookies?.[VISITOR_COOKIE] ?? 'desconocido';
}
