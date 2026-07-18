import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { BootstrapService } from './common/bootstraps/bootstrap.service';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
  });

  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  
  const bootstrapService = app.get(BootstrapService);
  await bootstrapService.createDefaultAdmin();
  
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();