import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

/**
 * Cabeceras que agrega el FRONTEND (Next en Vercel) al hablar con este backend.
 * Mismos nombres en `cercatrova-front/src/modules/shared/lib/proxyHeaders.ts`.
 */
export const PROXY_SECRET_HEADER = 'x-ct-proxy-secret';
export const CLIENT_IP_HEADER = 'x-ct-client-ip';

/** Marca de las requests que hace el propio servidor del front (SSR). */
export type FrontendAwareRequest = Request & { fromFrontendServer?: boolean };

function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * IP REAL del visitante cuando la request llega a través de Vercel.
 *
 * ── Por qué hace falta ───────────────────────────────────────────────────────
 * Con `trust proxy` bien configurado (ver `main.ts`), `req.ip` es quien se
 * conectó a Railway. Por el camino normal (navegador → Vercel `/api/*` →
 * Railway) esa IP es la de Vercel, compartida por muchos visitantes: el rate
 * limit (100/min por IP) los contaba juntos (medido en producción).
 *
 * ── Cómo ─────────────────────────────────────────────────────────────────────
 * El middleware de Next (en Vercel) manda la IP del visitante en
 * `x-ct-client-ip`, firmada con `PROXY_SHARED_SECRET` (secreto compartido
 * entre Vercel y Railway). Solo si el secreto coincide se usa esa IP como
 * `req.ip`, así que llamar DIRECTO a Railway inventando la cabecera no sirve.
 *
 * Si el secreto coincide pero no viene IP, la request es del servidor del front
 * (páginas renderizadas en Vercel): se marca `fromFrontendServer` para que no
 * consuma el límite por IP pensado para visitantes.
 *
 * Sin `PROXY_SHARED_SECRET` configurado no cambia nada (`req.ip` sigue siendo
 * la IP que escribe Railway). Las cabeceras se borran siempre: el secreto no
 * llega a los handlers ni a los logs.
 */
export function trustedProxyMiddleware(secret: string | undefined) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = req.headers[PROXY_SECRET_HEADER];
    const clientIp = req.headers[CLIENT_IP_HEADER];
    delete req.headers[PROXY_SECRET_HEADER];
    delete req.headers[CLIENT_IP_HEADER];

    if (secret && typeof key === 'string' && sameSecret(key, secret)) {
      const ip = typeof clientIp === 'string' ? clientIp.trim() : '';
      if (isIP(ip)) {
        // `req.ip` es un getter del prototipo de Express: una propiedad propia
        // lo pisa para TODO lo que lo lee (throttler, interacciones anónimas).
        Object.defineProperty(req, 'ip', {
          value: ip,
          configurable: true,
          enumerable: true,
        });
      } else {
        (req as FrontendAwareRequest).fromFrontendServer = true;
      }
    }
    next();
  };
}
