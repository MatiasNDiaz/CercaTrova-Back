import { ExecutionContext, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AUTH_COOKIE_NAME, clearAuthCookie } from 'src/modules/auth/auth-cookie.helper';

/**
 * Cabecera con la que el backend avisa "la sesión que traías ya no sirve y la
 * borré". El frontend la usa para mostrar "Tu sesión expiró, volvé a iniciar
 * sesión" en vez de un login pelado.
 */
export const SESSION_EXPIRED_HEADER = 'X-Session-Expired';

const logger = new Logger('Auth');

/**
 * Si la request traía una cookie de sesión y passport la rechazó (vencida,
 * revocada por `tokenVersion`, firma inválida, usuario borrado), la borra en
 * ESTA misma respuesta.
 *
 * ── El bug que resuelve (pantalla en blanco del panel) ──────────────────────
 * El middleware de Next solo DECODIFICA la cookie: una cookie revocada le
 * parece válida, así que dejaba entrar al panel y rebotaba `/login` de vuelta
 * al panel. El panel, a su vez, recibía 401 en `/auth/me` y no mostraba nada.
 * La única salida era borrar las cookies a mano. Como la cookie es httpOnly,
 * solo el backend puede borrarla: ahora lo hace apenas detecta que no sirve, y
 * el siguiente paso por el middleware ya no la encuentra.
 *
 * Devuelve `true` si había una cookie (o sea, si era una sesión "vieja").
 */
export function clearStaleSession(context: ExecutionContext, info: unknown): boolean {
  const http = context.switchToHttp();
  const req = http.getRequest<Request>();
  const res = http.getResponse<Response>();
  if (!req?.cookies?.[AUTH_COOKIE_NAME] || !res) return false;

  clearAuthCookie(res);
  res.setHeader(SESSION_EXPIRED_HEADER, '1');

  // Log del motivo para poder diagnosticar si vuelve a pasar (sin el token).
  const reason =
    (info as { name?: string; message?: string } | undefined)?.name ??
    (info as { message?: string } | undefined)?.message ??
    'sesión inválida';
  logger.warn(`Sesión rechazada y cookie borrada (${reason}) en ${req.method} ${req.originalUrl ?? req.url}`);
  return true;
}
