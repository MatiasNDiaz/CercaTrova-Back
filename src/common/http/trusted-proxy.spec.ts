// IP real del visitante detrás de Vercel + Railway (rate limit por visitante).
import express from 'express';
import request from 'supertest';
import { ExecutionContext } from '@nestjs/common';
import { AppThrottlerGuard } from 'src/common/guards/app-throttler.guard';
import {
  CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
  trustedProxyMiddleware,
} from './trusted-proxy';

const SECRET = 'secreto-de-prueba-123';

type IpBody = {
  ip: string;
  fromFrontendServer: boolean;
  leakedSecret: string | null;
  leakedClientIp: string | null;
};
const body = (res: { body: unknown }) => res.body as IpBody;

function buildApp(secret: string | undefined) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(trustedProxyMiddleware(secret));
  app.get('/ip', (req, res) =>
    res.json({
      ip: req.ip,
      fromFrontendServer:
        (req as { fromFrontendServer?: boolean }).fromFrontendServer ?? false,
      leakedSecret: req.headers[PROXY_SECRET_HEADER] ?? null,
      leakedClientIp: req.headers[CLIENT_IP_HEADER] ?? null,
    }),
  );
  return app;
}

describe('trust proxy = 1 (el proxy de Railway reescribe X-Forwarded-For)', () => {
  const app = buildApp(undefined);

  it('toma la IP que escribió Railway, no la del socket', async () => {
    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '200.1.2.3');
    expect(body(res).ip).toBe('200.1.2.3');
  });

  it('si alguien antepone IPs inventadas, se queda con la que agregó el proxy', async () => {
    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '6.6.6.6, 200.1.2.3');
    expect(body(res).ip).toBe('200.1.2.3');
  });
});

describe('trustedProxyMiddleware — IP del visitante enviada por el front (Vercel)', () => {
  const app = buildApp(SECRET);
  const VERCEL_IP = '76.76.21.9';

  it('con el secreto correcto usa la IP del visitante', async () => {
    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', VERCEL_IP)
      .set(PROXY_SECRET_HEADER, SECRET)
      .set(CLIENT_IP_HEADER, '181.10.20.30');
    expect(body(res).ip).toBe('181.10.20.30');
  });

  it('acepta IPv6', async () => {
    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', VERCEL_IP)
      .set(PROXY_SECRET_HEADER, SECRET)
      .set(CLIENT_IP_HEADER, '2800:810:4a1::1');
    expect(body(res).ip).toBe('2800:810:4a1::1');
  });

  it('con un secreto equivocado ignora la IP inventada (llamada directa a Railway)', async () => {
    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '190.0.0.1')
      .set(PROXY_SECRET_HEADER, 'adivinando')
      .set(CLIENT_IP_HEADER, '1.2.3.4');
    expect(body(res).ip).toBe('190.0.0.1');
    expect(body(res).fromFrontendServer).toBe(false);
  });

  it('una IP inválida no se usa', async () => {
    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', VERCEL_IP)
      .set(PROXY_SECRET_HEADER, SECRET)
      .set(CLIENT_IP_HEADER, 'no-es-una-ip');
    expect(body(res).ip).toBe(VERCEL_IP);
  });

  it('secreto correcto sin IP = request del servidor del front (SSR)', async () => {
    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', VERCEL_IP)
      .set(PROXY_SECRET_HEADER, SECRET);
    expect(body(res).fromFrontendServer).toBe(true);
    expect(body(res).ip).toBe(VERCEL_IP);
  });

  it('nunca deja el secreto ni la IP en las cabeceras que ven los handlers', async () => {
    const res = await request(app)
      .get('/ip')
      .set(PROXY_SECRET_HEADER, SECRET)
      .set(CLIENT_IP_HEADER, '181.10.20.30');
    expect(body(res).leakedSecret).toBeNull();
    expect(body(res).leakedClientIp).toBeNull();
  });

  it('sin secreto configurado en el backend no confía en nada', async () => {
    const res = await request(buildApp(undefined))
      .get('/ip')
      .set('X-Forwarded-For', VERCEL_IP)
      .set(PROXY_SECRET_HEADER, '')
      .set(CLIENT_IP_HEADER, '1.2.3.4');
    expect(body(res).ip).toBe(VERCEL_IP);
    expect(body(res).fromFrontendServer).toBe(false);
  });
});

describe('AppThrottlerGuard', () => {
  const ctx = (req: object) =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
    }) as unknown as ExecutionContext;
  // `shouldSkip` es protected: se prueba a través de una subclase mínima.
  class Probe extends AppThrottlerGuard {
    skip(req: object) {
      return this.shouldSkip(ctx(req));
    }
  }
  const guard = Object.create(Probe.prototype) as Probe;

  it('no limita las requests del servidor del front', async () => {
    await expect(guard.skip({ fromFrontendServer: true })).resolves.toBe(true);
  });

  it('a los visitantes sí los limita', async () => {
    await expect(guard.skip({})).resolves.toBe(false);
  });
});
