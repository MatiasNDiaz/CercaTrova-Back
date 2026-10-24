// Pantalla en blanco del panel: el backend tiene que BORRAR la cookie de una
// sesión que ya no sirve, para que el middleware de Next deje de rebotar el
// login al panel. Y la IP real del visitante detrás de los proxies.
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import express from 'express';
import request from 'supertest';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { SESSION_EXPIRED_HEADER } from './stale-session';

function ctx(cookies: Record<string, string>) {
  const res = { clearCookie: jest.fn(), setHeader: jest.fn() };
  const req = { cookies, method: 'GET', originalUrl: '/auth/me' };
  const context = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { context, res };
}

describe('JwtAuthGuard — sesión vencida o revocada', () => {
  const guard = new JwtAuthGuard(new Reflector());

  it('con cookie inválida: responde 401 Y borra la cookie, avisando con X-Session-Expired', () => {
    const { context, res } = ctx({ access_token: 'token-revocado' });
    expect(() => guard.handleRequest(null, false, { name: 'TokenExpiredError' }, context)).toThrow(UnauthorizedException);
    expect(res.clearCookie).toHaveBeenCalledWith('access_token', expect.objectContaining({ httpOnly: true }));
    expect(res.setHeader).toHaveBeenCalledWith(SESSION_EXPIRED_HEADER, '1');
  });

  it('sin cookie: 401 normal, no toca nada (visitante que nunca inició sesión)', () => {
    const { context, res } = ctx({});
    expect(() => guard.handleRequest(null, false, undefined, context)).toThrow(UnauthorizedException);
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('con sesión válida: devuelve el usuario y no borra nada', () => {
    const { context, res } = ctx({ access_token: 'ok' });
    expect(guard.handleRequest(null, { id: 1 }, undefined, context)).toEqual({ id: 1 });
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});

describe('OptionalJwtAuthGuard — sesión vencida en una ruta pública', () => {
  const guard = new OptionalJwtAuthGuard();

  it('sigue como anónimo (sin 401) y NO borra la cookie: eso le toca a /auth/me', () => {
    // Si la borrara, `/tracking/visit` (que sale en paralelo) se "comería" el
    // aviso y `/auth/me` llegaría sin cookie ni X-Session-Expired.
    expect(guard.handleRequest(null, false)).toBeNull();
  });

  it('con sesión válida devuelve el usuario', () => {
    expect(guard.handleRequest(null, { id: 3 })).toEqual({ id: 3 });
  });
});

describe('trust proxy = 2 (Vercel + Railway)', () => {
  const app = express();
  app.set('trust proxy', 2);
  app.get('/ip', (req, res) => res.json({ ip: req.ip }));

  it('toma la IP real del visitante, no la del proxy', async () => {
    // Cadena real: visitante → Vercel → Railway → app (socket = proxy de Railway).
    const res = await request(app).get('/ip').set('X-Forwarded-For', '200.1.2.3, 76.76.21.9');
    expect(res.body.ip).toBe('200.1.2.3');
  });

  it('ignora una IP inventada por el cliente que llega vía Vercel', async () => {
    // El cliente manda "6.6.6.6"; Vercel agrega su IP real y Railway la de Vercel.
    const res = await request(app).get('/ip').set('X-Forwarded-For', '6.6.6.6, 200.1.2.3, 76.76.21.9');
    expect(res.body.ip).toBe('200.1.2.3');
  });
});
