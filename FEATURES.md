# FEATURES — Funcionalidades faltantes implementadas

> Implementación de la sección "FUNCIONALIDADES FALTANTES" de AUDIT.md, sobre el código ya hardened (ver SECURITY_FIXES.md y SECURITY_FIXES_2.md). F2 (revocación con tokenVersion) y F5 (opt-out notifyBroadcast) ya estaban resueltas en las tandas anteriores.

## Impacto en frontend

_(Cambios/agregados de contrato de API de esta tanda.)_

- **F7:** nuevo endpoint `PATCH /users/me` (JWT requerido) para que el usuario edite su propio perfil — mismo body que `PATCH /users/:id` (`UpdateUserDto`). El frontend debería migrar la pantalla de perfil a este endpoint. Ojo: si el body incluye `password`, la sesión actual queda revocada (tokenVersion) — tras cambiar el password hay que re-loguear.
- **F8:** los usuarios creados vía Google llegan con `profileIncomplete: true` en la respuesta de login/`GET /auth/me`. El frontend debería chequear este flag tras el login y guiar al usuario a completar teléfono y contraseña (vía `PATCH /users/me`); al completar ambos, el backend lo pone en `false` automáticamente.

---

## F9 - Helmet (headers de seguridad)
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `package.json` (nueva dependencia `helmet`), `src/main.ts`
- Qué faltaba: ningún header de seguridad estándar en las respuestas.
- Qué se implementó: `app.use(helmet({ contentSecurityPolicy: false }))` en `main.ts` — aplica los defaults (X-Content-Type-Options, X-Frame-Options, HSTS, etc.). CSP queda deshabilitada por ahora: es una API JSON consumida por un frontend aparte.
- Estado: ✅ Implementado y verificado con npm run build

## F7 - Endpoint de perfil propio (PATCH /users/me)
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/users/users.controller.ts`
- Qué faltaba: el usuario se editaba vía `PATCH /users/:id` con check manual de ownership — superficie de IDOR innecesaria para el caso "editar mi perfil".
- Qué se implementó: `PATCH /users/me` con `JwtAuthGuard` + `@GetUser('id')` (el id sale solo del token), reutilizando `UsersService.updateUser()` tal cual. Declarado antes de `PATCH /:id` para que `'me'` no matchee como id. `PATCH /users/:id` queda como estaba (uso admin / compatibilidad).
- Estado: ✅ Implementado y verificado con npm run build

## F3 - Notificación "solicitud recibida" al crear PropertyRequest
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/PropertyRequest/propertyRequest.service.ts`
- Qué faltaba: al crear una solicitud solo se notificaba al admin — el template de estado `ENVIADO` ("Solicitud recibida") existía pero nunca se disparaba en la creación.
- Qué se implementó: `create()` ahora también llama a `handleRequestStatusChange(saved)` (no bloqueante, mismo patrón que el resto), adjuntando el `user` ya buscado para el nombre porque el método requiere `request.user.email`. El usuario recibe la notificación in-app + email "Tu solicitud fue recibida" al instante.
- Estado: ✅ Implementado y verificado con npm run build

## F8 - Base de vinculación Google ↔ tradicional (profileIncomplete)
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/users/users.service.ts`, `src/modules/auth/auth.service.ts`
- Qué faltaba: la columna `profileIncomplete` existía en la entidad pero nunca se marcaba `true`, pese a que los usuarios de Google se crean con `phone: ''` y sin password local.
- Qué se implementó: `createUser()` acepta un parámetro interno `profileIncomplete` (no expuesto en el DTO público — un cliente no puede setearlo); `googleLogin()` lo pasa en `true` al crear. `updateUser()` limpia el flag automáticamente cuando el usuario define contraseña local y tiene teléfono. El flujo completo de UI queda para el frontend (ver Impacto en frontend).
- Estado: ✅ Implementado y verificado con npm run build

## F4 - Reintentos de email con backoff + registro de fallos
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/notifications/email/email.service.ts`, `src/modules/notifications/email/entities/failed-email.entity.ts` (nuevo), `src/modules/notifications/email/email.module.ts`, `src/config/typeorm.config.ts`
- Qué faltaba: ante un fallo de SendGrid el email se perdía para siempre (solo un log en consola), sin registro consultable.
- Qué se implementó: `sendEmail()` reintenta hasta 3 veces con backoff corto (500 ms / 1500 ms). Si falla definitivamente, persiste el fallo en la tabla nueva `failed_emails` (to, subject, error, attempts, createdAt — opción confirmada por el usuario) de forma best-effort y recién ahí propaga el error. Sin cola externa (Redis/BullMQ sería sobre-ingeniería para el tamaño actual).
- Estado: ✅ Implementado y verificado con npm run build

## F10 - Tests de guards y autorización
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/common/guards/roles.guard.spec.ts` (nuevo), `src/common/guards/jwt-auth.guard.spec.ts` (nuevo), `src/common/guards/authorization.integration.spec.ts` (nuevo), `package.json` (moduleNameMapper de Jest para resolver los imports `src/...`)
- Qué faltaba: ningún `*.spec.ts` en `src/` — tests que habrían detectado C3-C6 (guards faltantes/decorativos).
- Qué se implementó: 14 tests (todos PASS). Unitarios: `RolesGuard` (sin roles → pasa; sin user → 403 y no 500 [M5]; rol incorrecto → rechaza; rol correcto → permite) y `JwtAuthGuard` (respeta `@Public()`, delega en passport si no). Integración liviana sin DB (controllers y guards REALES, `JwtStrategy` real, services mockeados): favorites/property-images/property-types sin token → 401; USER en rutas ADMIN → 403; `GET /property-types` público → 200; sesión válida → 200; `tokenVersion` desactualizado → 401 (blinda también el punto 15).
- Estado: ✅ Implementado — `npm test`: 3 suites / 14 tests PASS; `npm run build` OK

## F1 - Refresh token real (SOLO DISEÑO — sin código, decisión de alcance)
- Fecha: 2026-07-18
- Archivo(s) modificado(s): ninguno (documentación).
- Contexto: `tokenVersion` (punto 15 de SECURITY_FIXES.md) ya resuelve la revocación real de sesión. El refresh token completo requiere renovación silenciosa en el frontend, fuera del alcance de esta sesión de backend. Diseño propuesto para cuando se trabaje el frontend:

### Diseño propuesto
1. **Tokens:** access token JWT corto (**15-30 min**, cookie `access_token` actual) + refresh token opaco (**random de 64 bytes, NO JWT**) de **14 días**, en cookie httpOnly separada `refresh_token` con `path: '/auth/refresh'` (solo viaja a ese endpoint).
2. **Persistencia:** columna `refreshTokenHash` (sha256 del token, `select: false`) + `refreshTokenExpiresAt` en `User` — o tabla `refresh_tokens` (userId, hash, expiresAt, createdAt) si se quiere permitir múltiples dispositivos simultáneos. Nunca guardar el token en claro.
3. **Endpoint `POST /auth/refresh`:** lee la cookie, hashea y compara contra DB + expiración → emite un access token nuevo Y un refresh token nuevo (**rotación**: el viejo se invalida al usarse). Si el hash no coincide (token robado/reusado) → invalidar TODOS los refresh del usuario e incrementar `tokenVersion` (cierre global de sesión).
4. **Cambios en login/google/logout:** login emite ambos tokens; logout borra ambas cookies y limpia el hash en DB (además del incremento de `tokenVersion` actual).
5. **Frontend:** interceptor que ante un 401 del access token llame a `/auth/refresh` una única vez y reintente; si el refresh también da 401 → redirigir a login. Eliminar el `maxAge` de 24 h: la sesión "larga" pasa a vivir en el refresh.
6. **Convivencia:** `JwtStrategy.validate()` queda igual (DB + tokenVersion); `JWT_EXPIRATION_TIME` baja a `'20m'` recién cuando el frontend tenga el interceptor — hacerlo antes desloguearía a los usuarios cada 20 minutos.
- Estado: 📋 Documentado — implementación diferida a la fase de frontend
