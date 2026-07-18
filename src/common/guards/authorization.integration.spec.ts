// (F10): test de integración liviana de autorización — levanta los
// controllers REALES con sus guards REALES (JwtStrategy incluida) y
// services mockeados (sin DB). Habría detectado C3, C4 y C5 de AUDIT.md.
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { JwtStrategy } from 'src/modules/auth/strategies/jwt.strategy';
import { UsersService } from 'src/modules/users/users.service';
import { FavoritesController } from 'src/modules/favorites/favorites.controller';
import { FavoritesService } from 'src/modules/favorites/favorites.service';
import { PropertyImagesController } from 'src/modules/ImagesProperty/propertyImages.controller';
import { PropertyImagesService } from 'src/modules/ImagesProperty/propertyImages.service';
import { TypeOfPropertyController } from 'src/modules/typeOfProperty/typeOfProperty.controller';
import { TypeOfPropertyService } from 'src/modules/typeOfProperty/typeOfProperty.service';
import { Role } from 'src/modules/users/enums/role.enum';

const JWT_SECRET = 'secreto-solo-para-tests';

describe('Autorización end-to-end liviana (guards reales, services mockeados)', () => {
  let app: INestApplication;

  // Usuario "real" que JwtStrategy.validate() encuentra en la (mock) DB
  const regularUser = { id: 1, email: 'user@test.local', role: Role.USER, tokenVersion: 0 };

  const jwt = new JwtService({ secret: JWT_SECRET });
  const cookieFor = (payload: Record<string, unknown>) =>
    `access_token=${jwt.sign(payload)}`;

  const userCookie = () =>
    cookieFor({ sub: regularUser.id, email: regularUser.email, role: Role.USER, tokenVersion: 0 });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        FavoritesController,
        PropertyImagesController,
        TypeOfPropertyController,
      ],
      providers: [
        // Strategy real: registra 'jwt' en passport y aplica los checks
        // de los puntos 14 y 15 (usuario en DB + tokenVersion)
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => (key === 'JWT_SECRET' ? JWT_SECRET : undefined) },
        },
        { provide: UsersService, useValue: { getUserById: jest.fn().mockResolvedValue(regularUser) } },
        { provide: FavoritesService, useValue: { getAllFavorites: jest.fn().mockResolvedValue([]) } },
        { provide: PropertyImagesService, useValue: { deleteImage: jest.fn() } },
        {
          provide: TypeOfPropertyService,
          useValue: { findAll: jest.fn().mockResolvedValue([]), create: jest.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser()); // la strategy lee el JWT de la cookie
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Sin autenticación → 401 (C5, C4, C3) ────────────────────────────
  it('GET /favorites sin token → 401 (C5)', () =>
    request(app.getHttpServer()).get('/favorites').expect(401));

  it('DELETE /property-images/:id sin token → 401 (C4)', () =>
    request(app.getHttpServer()).delete('/property-images/1').expect(401));

  it('POST /property-types sin token → 401 (C3)', () =>
    request(app.getHttpServer()).post('/property-types').send({ name: 'x' }).expect(401));

  it('GET /property-types sigue siendo público (@Public) → 200 (C3)', () =>
    request(app.getHttpServer()).get('/property-types').expect(200));

  // ── Autenticado como USER en rutas ADMIN → 403 (C4, C3) ─────────────
  it('DELETE /property-images/:id como USER → 403 (C4)', () =>
    request(app.getHttpServer())
      .delete('/property-images/1')
      .set('Cookie', userCookie())
      .expect(403));

  it('POST /property-types como USER → 403 (C3)', () =>
    request(app.getHttpServer())
      .post('/property-types')
      .send({ name: 'x' })
      .set('Cookie', userCookie())
      .expect(403));

  // ── Sesión válida → 200 y revocación por tokenVersion → 401 (15) ────
  it('GET /favorites con sesión válida → 200', () =>
    request(app.getHttpServer())
      .get('/favorites')
      .set('Cookie', userCookie())
      .expect(200));

  it('token con tokenVersion desactualizado (revocado) → 401 (punto 15)', () =>
    request(app.getHttpServer())
      .get('/favorites')
      .set('Cookie', cookieFor({ sub: regularUser.id, email: regularUser.email, role: Role.USER, tokenVersion: 99 }))
      .expect(401));
});
