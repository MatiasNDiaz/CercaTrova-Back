import { createHash } from 'crypto';
import { createParamDecorator, ExecutionContext, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { VISITOR_COOKIE } from 'src/modules/tracking/visitor-id.middleware';
import { Role } from 'src/modules/users/enums/role.enum';

/**
 * Quién hace una interacción pública (comentar, dar "me gusta", calificar).
 *
 * Desde la actualización "interacciones sin iniciar sesión", esas acciones
 * aceptan visitantes anónimos. Este objeto junta todo lo que hace falta para
 * atribuirlas:
 *
 *  - `userId`/`role`: si viajó un JWT válido (`OptionalJwtAuthGuard` lo puso en
 *    `req.user`). Un token inválido o vencido deja `userId: null` → anónimo.
 *  - `visitorId`: la cookie anónima `ct_vid` que el backend ya pone en TODAS
 *    las respuestas (`VisitorIdMiddleware`): UUID, httpOnly (JavaScript no la
 *    puede leer ni robar), dura 1 año. Es lo que evita "me gusta" y
 *    calificaciones duplicados sin pedir login.
 *  - `ipHash`: SHA-256 de la IP con una sal (`IP_HASH_SALT`). Apoyo contra
 *    abusos; la IP en texto plano NUNCA se guarda.
 *
 * ⚠️ `visitorId` e `ipHash` son internos: las columnas que los guardan tienen
 * `select: false` y nunca salen en una respuesta.
 */
export interface InteractionActor {
  userId: number | null;
  role: Role | null;
  visitorId: string | null;
  ipHash: string;
  /** IP real del cliente — solo en memoria, para el rate limit. Nunca se persiste. */
  ip: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `true` si el valor tiene formato de UUID (v1–v8). */
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/**
 * IP real del cliente.
 *
 * El backend recibe los pedidos a través del proxy de Vercel (`/api/*`), así
 * que `req.ip` es la IP de Vercel — compartida por TODOS los visitantes. La
 * del cliente viaja en `x-forwarded-for` (primer valor de la lista, que Vercel
 * fija con la IP pública real).
 */
export function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  return first || req.ip || req.socket?.remoteAddress || 'desconocida';
}

const logger = new Logger('InteractionActor');
let warnedSalt = false;

/** SHA-256(sal + IP). Sin `IP_HASH_SALT` usa una sal fija de desarrollo y avisa. */
export function hashIp(ip: string): string {
  let salt = process.env.IP_HASH_SALT;
  if (!salt) {
    salt = 'cercatrova-dev-salt';
    if (!warnedSalt) {
      warnedSalt = true;
      logger.warn('IP_HASH_SALT no está definida: se usa una sal de desarrollo. Definila en producción.');
    }
  }
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

/** Arma el actor de la request. Se usa vía el decorador `@Actor()`. */
export function actorFromRequest(req: Request): InteractionActor {
  const user = req.user as { id?: number; role?: Role } | undefined;
  const cookie = req.cookies?.[VISITOR_COOKIE];
  const ip = clientIp(req);
  return {
    userId: typeof user?.id === 'number' ? user.id : null,
    role: user?.role ?? null,
    visitorId: isUuid(cookie) ? cookie : null,
    ipHash: hashIp(ip),
    ip,
  };
}

/**
 * `@Actor()` — inyecta el `InteractionActor` en un handler. Va siempre junto a
 * `OptionalJwtAuthGuard`, que es el que puebla `req.user` sin rechazar.
 */
export const Actor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): InteractionActor =>
    actorFromRequest(ctx.switchToHttp().getRequest<Request>()),
);

/** Nombre a mostrar de un comentario: el del usuario, el que puso el visitante o "Visitante". */
export function displayName(c: { user?: { name?: string | null } | null; guestName?: string | null }): string {
  return c.user?.name || c.guestName?.trim() || 'Visitante';
}
