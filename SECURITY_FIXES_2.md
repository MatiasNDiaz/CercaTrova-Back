# SECURITY_FIXES_2 — Registro de correcciones (tanda 2)

> Continuación de SECURITY_FIXES.md — correcciones de hallazgos MEDIOS y BAJOS restantes de AUDIT.md.

## Impacto en frontend

_(Cambios de contrato de API de esta tanda que requieren actualizar el repo del frontend.)_

- **M9:** los endpoints `/auth/login`, `/auth/register` y `/auth/google` responden `429 Too Many Requests` a partir del 6.º intento en un minuto desde la misma IP (el resto de la API, a partir de la request 101/min). El frontend debería mostrar un mensaje de "demasiados intentos, esperá un momento" ante un 429.
- **M8 (a futuro):** hará falta un toggle en el perfil del usuario para el opt-out de emails masivos — ya funciona vía `PATCH /users/:id` con body `{ "notifyBroadcast": false }`.
- **M3:** todos los endpoints `GET /stats/*` ahora requieren sesión de ADMIN (antes eran públicos). Si alguna vista no-admin del frontend los consumía, va a recibir 401/403.
- **M12:** las subidas de imágenes (foto de perfil y properties) ahora rechazan con 400 archivos que no sean `image/*` o pesen más de 5 MB — conviene validar en el cliente antes de subir.
- **M4:** el formato del request de `POST /properties` y `PATCH /properties/:id` NO cambia (multipart con campo `data` JSON), pero ahora el JSON se valida de verdad: campos faltantes, tipos incorrectos o campos extra devuelven 400 con detalle (antes pasaban de largo).
- **B8:** el login ahora exige password de mínimo 5 caracteres (antes 4) y ni login ni register aceptan campos extra como `id`/`createdAt` (400 si se mandan).
- **B1:** cambian textos de error que el frontend pueda estar mostrando: registro con email existente → "No se pudo completar el registro. Verificá los datos ingresados."; login de cuenta Google sin password → "Credenciales inválidas".

---

## M9 - Sin rate limiting
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `package.json` (nueva dependencia `@nestjs/throttler`), `src/app.module.ts`, `src/modules/auth/auth.controller.ts`
- Problema original: no existía ningún rate limiting — `/auth/login`, `/auth/register` y `/auth/google` eran fuerza-brutables sin límite.
- Cambio aplicado: `ThrottlerModule` global (100 req/min por IP) con `ThrottlerGuard` registrado como `APP_GUARD`, y `@Throttle(5/min)` estricto en las tres rutas de credenciales.
- Estado: ✅ Corregido y verificado con npm run build

## M11 - CORS hardcodeado a localhost:3001
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/main.ts`, `.env.example`
- Problema original: el origin de CORS estaba fijo en `http://localhost:3001` — al deployar el frontend todo fallaría hasta editar código.
- Cambio aplicado: el origin sale de `FRONTEND_URL` (admite lista separada por comas), con fallback a `http://localhost:3001` solo si la variable no está definida. `FRONTEND_URL` agregada a `.env.example`.
- Estado: ✅ Corregido y verificado con npm run build

## M4 - ValidationPipe bypasseado en properties (create/update)
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/common/pipes/json-to-dto.pipe.ts` (nuevo), `src/modules/properties/properties.controller.ts`
- Problema original: `POST /properties` y `PATCH /properties/:id` hacían `JSON.parse()` manual del campo `data` — `CreatePropertyDto`/`UpdatePropertyDto` nunca pasaban por class-validator y cualquier basura llegaba a TypeORM.
- Cambio aplicado: Pipe reutilizable `JsonToDtoPipe(DtoClass)` que parsea el JSON y valida con `plainToInstance` + `validate` usando las mismas opciones del pipe global (`whitelist` + `forbidNonWhitelisted`). El formato del request no cambia (multipart con campo `data`), pero ahora payloads con campos faltantes/erróneos/extra reciben 400 con detalle.
- Estado: ✅ Corregido y verificado con npm run build

## M10 - synchronize: true sin migrations
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/config/typeorm.config.ts`
- Problema original: `synchronize: true` incondicional — en producción cualquier cambio de entidad alteraría el schema real automáticamente (puede dropear columnas con datos).
- Cambio aplicado: `synchronize: process.env.NODE_ENV !== 'production'` — el flujo de desarrollo actual no cambia, pero producción queda protegida por código.
- ⚠️ PENDIENTE ANTES DE CUALQUIER DEPLOY A PRODUCCIÓN: configurar un `DataSource` para CLI, generar migrations reales (`typeorm migration:generate`), aplicarlas con `migration:run` en el ambiente productivo, y correr la app con `NODE_ENV=production` (que ahora desactiva synchronize automáticamente). Sin migrations, la primera corrida en producción no creará el schema.
- Estado: ✅ Corregido y verificado con npm run build

## M7 - Propiedades sin imágenes no disparaban notificaciones
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/properties/properties.service.ts`
- Problema original: `createWithImages()` tenía un `return` temprano cuando `images.length === 0`, ANTES del paso que llama a `handleNewProperty()` — una propiedad sin fotos jamás notificaba a nadie (ni matching ni broadcast).
- Cambio aplicado: Se eliminó el return temprano; la subida de imágenes quedó condicional y la recarga + disparo de notificaciones se ejecuta siempre. La forma de la respuesta no cambia (`images: []` cuando no hay fotos).
- Estado: ✅ Corregido y verificado con npm run build

## M8 - Broadcast masivo de emails sin opt-out
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/users/entities/user.entity.ts`, `src/modules/notifications/notifications.service.ts`, `src/modules/users/dto/update-user.dto.ts`
- Problema original: `broadcastNewProperty()` y `handlePriceChange()` emailaban a TODOS los usuarios por cada propiedad nueva / baja de precio — spam y agotamiento de cuota SendGrid.
- Cambio aplicado: Campo `notifyBroadcast` (boolean, default `true`) en `User`; ambos métodos filtran los destinatarios de EMAIL por ese campo (la notificación in-app se guarda igual para todos). Se agregó `notifyBroadcast` opcional a `UpdateUserDto` para que el futuro toggle funcione vía `PATCH /users/:id`.
- Estado: ✅ Corregido y verificado con npm run build

## M12 - Uploads sin validación de tipo ni tamaño
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/common/multer/image-upload.options.ts` (nuevo), `src/modules/users/users.controller.ts`, `src/modules/properties/properties.controller.ts`
- Problema original: ningún interceptor de subida definía `limits` ni `fileFilter` — se podía subir un ejecutable de 500 MB como "foto" (consumo de memoria, cuota Cloudinary, archivos no-imagen).
- Cambio aplicado: Opciones compartidas `imageUploadOptions` (máx. 5 MB, solo `image/*` con 400 claro si no cumple) aplicadas a los 3 interceptors: foto de perfil (`PATCH /users/:id/photo`), `POST /properties` y `PATCH /properties/:id`.
- Estado: ✅ Corregido y verificado con npm run build

## M3 - stats.controller sin ningún guard
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/stats/stats.controller.ts`
- Problema original: los 20 endpoints de métricas de negocio (demanda por zona/tipo, precios pedidos, etc.) eran públicos.
- Cambio aplicado: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(ADMIN)` a nivel controller — son datos del dashboard administrativo, sin uso público en el frontend.
- Estado: ✅ Corregido y verificado con npm run build

## B1 - Enumeración de usuarios en login/registro
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/auth/auth.service.ts`, `src/modules/users/users.service.ts`
- Problema original: register respondía "Usuario ya existente" y el login distinguía "se registró con Google" — permitía averiguar si un email está registrado y con qué método.
- Cambio aplicado: register (y el check de email duplicado de `createUser()`) responden un genérico "No se pudo completar el registro. Verificá los datos ingresados."; el caso de usuario Google en login responde "Credenciales inválidas" como cualquier otro fallo.
- Estado: ✅ Corregido y verificado con npm run build

## B2 - throw new Error() genérico → 500 en favoritos y search-preferences
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/favorites/favorites.service.ts`, `src/modules/search-preferences/search-preferences.service.ts`
- Problema original: los services lanzaban `Error` plano — el cliente recibía `500 Internal Server Error` en casos que son 404 ("no existe") o 409 ("ya está en favoritos").
- Cambio aplicado: `NotFoundException` para usuario/propiedad/favorito inexistente, `ConflictException` para favorito duplicado.
- Estado: ✅ Corregido y verificado con npm run build

## B3 - Password del admin sin validación de fortaleza
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/common/bootstraps/bootstrap.service.ts`
- Problema original: `ADMIN_PASSWORD` se aceptaba sin ninguna validación — un `admin123` en el `.env` creaba el admin igual (y antes además se logueaba, ver C9).
- Cambio aplicado: Si el admin no existe todavía y `ADMIN_PASSWORD` tiene menos de 12 caracteres, se lanza error y se aborta el arranque con mensaje claro. Si el admin ya existe, el arranque no se ve afectado.
- Estado: ✅ Corregido y verificado con npm run build

## B4 - npm run lint roto (error de sintaxis en eslint.config.mjs)
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `eslint.config.mjs`
- Problema original: un bloque `"prettier/prettier": [...]` suelto fuera del objeto de reglas rompía el config — `npm run lint` no podía ejecutarse.
- Cambio aplicado: Se eliminó el bloque suelto (la regla ya estaba correctamente declarada dentro de `rules`). Verificado con `node --check` y ejecutando eslint: el linter corre correctamente. Decisión confirmada por el usuario: NO se corrió `--fix` masivo — quedan 1003 problemas preexistentes reportados (837 de formato auto-corregibles + ~166 de tipado + 1 de config del e2e) para resolver en una tarea aparte y no mezclar formato con este diff.
- Estado: ✅ Corregido y verificado (lint ejecuta; limpieza del backlog pendiente aparte)

## B5 - Rating sin DTO
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/ratings/dto/create-rating.dto.ts` (era un stub vacío), `src/modules/ratings/ratings.controller.ts`
- Problema original: `POST /ratings/:propertyId` usaba `@Body('score')` suelto — sin validación de tipo ni rango a nivel pipe.
- Cambio aplicado: `CreateRatingDto` con `@IsInt() @Min(1) @Max(5)` en `score`, aplicado con `@Body()` completo. El contrato no cambia (el body sigue siendo `{ "score": n }`), pero ahora valores no enteros o fuera de 1-5 reciben 400.
- Estado: ✅ Corregido y verificado con npm run build

## B6 - Remitente de email hardcodeado
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/notifications/email/email.service.ts`, `.env.example`
- Problema original: `from: 'matidiazargentino21@gmail.com'` hardcodeado en el código (además Gmail como remitente en SendGrid falla DMARC).
- Cambio aplicado: El remitente sale de `EMAIL_FROM` del `.env` (sin fallback, consistente con la convención de fail-fast del proyecto: la app aborta el arranque si falta). Agregada a `.env.example`.
- ⚠️ ACCIÓN REQUERIDA: agregar `EMAIL_FROM` al `.env` real (idealmente un remitente verificado en SendGrid).
- Estado: ✅ Corregido y verificado con npm run build

## B8 - Inconsistencias menores en DTOs de auth
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/auth/dto/login-auth.dto.ts`, `src/modules/auth/dto/register-auth.dto.ts`
- Problema original: `LoginDto` aceptaba `MinLength(4)` (vs 5 en register) y un campo `id`; `RegisterDto` aceptaba `id`, `createdAt` y `updatedAt` que el cliente no debería poder mandar.
- Cambio aplicado: `MinLength(5)` unificado (el valor más seguro de los dos) y eliminados todos los campos generados por la DB de ambos DTOs (con `forbidNonWhitelisted`, mandarlos ahora da 400). El transform del email quedó null-safe (`value?.trim()`).
- Estado: ✅ Corregido y verificado con npm run build
