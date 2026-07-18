// src/modules/auth/auth-cookie.helper.ts
import type { Response, CookieOptions } from 'express';

export const AUTH_COOKIE_NAME = 'access_token';

// Convierte JWT_EXPIRATION_TIME ("24h", "30m", "7d", "3600" = segundos)
// a milisegundos para el maxAge de la cookie. Fallback: 24 h.
function parseExpirationToMs(exp?: string): number {
  const DEFAULT_MS = 24 * 60 * 60 * 1000;
  if (!exp) return DEFAULT_MS;
  const match = /^(\d+)([smhd]?)$/.exec(exp.trim());
  if (!match) return DEFAULT_MS;
  const value = Number(match[1]);
  const unit = match[2] || 's';
  const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return value * factor;
}

// 🔒 SEGURIDAD (punto 13): atributos ÚNICOS para setear y borrar la cookie
// de sesión. Antes login/google/logout usaban configuraciones distintas —
// si set y clear difieren, algunos navegadores no borran la cookie.
function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...baseOptions(),
    // maxAge derivado de JWT_EXPIRATION_TIME para que la cookie nunca viva
    // más (ni menos) que el JWT — evita "sesiones fantasma" con 401
    maxAge: parseExpirationToMs(process.env.JWT_EXPIRATION_TIME),
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, baseOptions());
}
