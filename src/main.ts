import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { BootstrapService } from './common/bootstraps/bootstrap.service';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 🔒 IP REAL DEL VISITANTE detrás de los proxies.
  //
  // En producción el navegador llega así: navegador → Vercel (`/api/*`, rewrite)
  // → proxy de Railway → esta app. Sin `trust proxy`, `req.ip` era la IP del
  // proxy de Railway / Vercel — compartida por MUCHOS visitantes — y el rate
  // limit global (100/min por IP) los contaba a todos juntos: un pico de
  // tráfico podía dar 429 a cualquiera, incluido el admin en `/auth/me`.
  //
  // `trust proxy = N` hace que Express tome la IP de `X-Forwarded-For`
  // salteando los N saltos de proxy de la derecha (los nuestros). Con 2
  // (Railway + Vercel), `req.ip` es el cliente real. Por el camino normal
  // (vía Vercel) un `X-Forwarded-For` inventado por el cliente queda a la
  // izquierda de las entradas que agregan nuestros proxies y se ignora.
  // ⚠️ Límite conocido: quien llame DIRECTO a la URL de Railway (salteando
  // Vercel) puede elegir la IP que ve el rate limit. Solo le sirve para
  // esquivar el límite, no para autenticarse. Cerrarlo del todo requiere que
  // Vercel firme las requests con un secreto compartido.
  // Configurable con TRUST_PROXY_HOPS si cambia la cadena de proxies.
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? 2);
  app.set('trust proxy', Number.isFinite(hops) && hops >= 0 ? hops : 2);

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