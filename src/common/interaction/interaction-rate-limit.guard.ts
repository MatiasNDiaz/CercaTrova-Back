import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { actorFromRequest } from './interaction-actor';

/**
 * Límite de interacciones públicas por minuto, por IP Y por visitante.
 *
 * ¿Por qué no alcanza el `ThrottlerGuard` global? Porque ese cuenta por
 * `req.ip`, que detrás del proxy de Vercel es la IP de Vercel (compartida por
 * todos), y con un único criterio. Acá se cuentan las dos llaves por separado:
 * cambiar de cookie no saltea el límite de la IP, y compartir IP (una oficina,
 * datos móviles) no castiga de más a cada visitante — el límite por IP es más
 * holgado.
 *
 * Ventana deslizante de 60 s en memoria. Alcanza con una sola instancia del
 * backend (Railway, hoy); con varias, cada una contaría por su lado.
 *
 * Configurable por entorno:
 *   INTERACTION_COMMENTS_PER_MIN  (default 5)  — comentarios y respuestas
 *   INTERACTION_REACTIONS_PER_MIN (default 30) — "me gusta" y estrellas
 * El límite por IP es el triple del de visitante.
 */
type Kind = 'comment' | 'reaction';

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function limitFor(kind: Kind): number {
  const raw =
    kind === 'comment'
      ? process.env.INTERACTION_COMMENTS_PER_MIN
      : process.env.INTERACTION_REACTIONS_PER_MIN;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : kind === 'comment' ? 5 : 30;
}

/** Registra un intento en `key`; devuelve `false` si ya superó `max` en la ventana. */
function take(key: string, max: number, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

// Limpieza periódica: que el mapa no crezca sin fin con visitantes viejos.
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of hits) {
    if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
  }
}, WINDOW_MS).unref();

/** Solo para tests: vacía los contadores. */
export function resetInteractionRateLimits() {
  hits.clear();
}

abstract class InteractionRateLimitGuard implements CanActivate {
  protected abstract readonly kind: Kind;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const actor = actorFromRequest(req);
    const max = limitFor(this.kind);
    const now = Date.now();

    const okIp = take(`${this.kind}:ip:${actor.ipHash}`, max * 3, now);
    // Un usuario logueado se cuenta por su cuenta; un anónimo, por su cookie.
    const who = actor.userId ? `u${actor.userId}` : actor.visitorId ? `v${actor.visitorId}` : null;
    const okWho = who ? take(`${this.kind}:who:${who}`, max, now) : true;

    if (!okIp || !okWho) {
      throw new HttpException(
        this.kind === 'comment'
          ? 'Estás comentando muy rápido. Esperá un minuto y volvé a intentarlo.'
          : 'Demasiadas acciones seguidas. Esperá un minuto y volvé a intentarlo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}

@Injectable()
export class CommentRateLimitGuard extends InteractionRateLimitGuard {
  protected readonly kind = 'comment' as const;
}

@Injectable()
export class ReactionRateLimitGuard extends InteractionRateLimitGuard {
  protected readonly kind = 'reaction' as const;
}
