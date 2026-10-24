import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { BootstrapService } from './common/bootstraps/bootstrap.service';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { trustedProxyMiddleware } from './common/http/trusted-proxy';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 🔒 IP REAL DEL VISITANTE detrás de los proxies.
  //
  // Sin `trust proxy`, `req.ip` era la IP interna del proxy de Railway: UNA
  // para todo el sitio, y el rate limit global (100/min por IP) contaba a
  // todos los visitantes juntos → 429 para cualquiera, incluido el admin en
  // `/auth/me` (una de las causas de la pantalla en blanco).
  //
  // El proxy de Railway descarta el `X-Forwarded-For` entrante y escribe la IP
  // de quien se le conecta (medido en producción). Confiar en ESE salto (1)
  // da esa IP y no se puede falsificar. Para quien llega vía Vercel esa IP es
  // la de Vercel: la del visitante la aporta `trustedProxyMiddleware` (abajo).
  // Configurable con TRUST_PROXY_HOPS si cambia la cadena de proxies.
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  app.set('trust proxy', Number.isFinite(hops) && hops >= 0 ? hops : 1);
  app.use(trustedProxyMiddleware(process.env.PROXY_SHARED_SECRET));

  // 🔒 SEGURIDAD (F9): headers de seguridad estándar (X-Content-Type-Options,
  // X-Frame-Options, HSTS, etc.). CSP deshabilitada por ahora: es una API
  // JSON consumida por un frontend aparte y una CSP estricta no aporta acá.
  app.use(helmet({ contentSecurityPolicy: false }));

  // 🔒 SEGURIDAD (M11): el origin sale de FRONTEND_URL (admite varios,
  // separados por coma); fallback a localhost:3001 solo para desarrollo
  app.enableCors({
    origin: process.env.FRONTEND_URL?.split(',').map((o) => o.trim()) ?? 'http://localhost:3001',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Importante para que funcionen las cookies/sesiones
    // Aviso de "tu sesión expiró y se borró" (ver `stale-session.ts`). En
    // producción el front va por el proxy del mismo dominio; en desarrollo es
    // cross-origin y sin esto el navegador no deja leer la cabecera.
    exposedHeaders: ['X-Session-Expired'],
  });

  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  
  const bootstrapService = app.get(BootstrapService);
  await bootstrapService.ensurePostgresExtensions();
  await bootstrapService.createDefaultAdmin();
  
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();