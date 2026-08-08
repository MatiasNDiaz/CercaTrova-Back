# FEATURES — Funcionalidades faltantes implementadas

> Implementación de la sección "FUNCIONALIDADES FALTANTES" de AUDIT.md, sobre el código ya hardened (ver SECURITY_FIXES.md y SECURITY_FIXES_2.md). F2 (revocación con tokenVersion) y F5 (opt-out notifyBroadcast) ya estaban resueltas en las tandas anteriores.
>
> **Las secciones N1–N3 (2026-08-08) son una tanda posterior y de otra naturaleza**: no salen de AUDIT.md sino de un pedido de producto (moneda por propiedad, orden de imágenes, expensas y apto mascotas). Se documentan acá porque son funcionalidades nuevas del backend, no correcciones. El contrato completo está en `API_CONTRACT.md`; los cambios del lado del cliente, en `cercatrova-front/FRONTEND_CHANGES.md` (PARTE 12).

---

# Tanda 2026-08-08 — 3 funcionalidades nuevas de producto

## Impacto en frontend (resumen)

- **`Property.currency`** (`'ARS' | 'USD'`) viaja en las 3 lecturas públicas. El precio deja de ser un número sin unidad: cualquier vista que imprima "USD" fijo ahora miente sobre las propiedades en pesos.
- **`PropertyImages.order`** + `PATCH /property-images/:propertyId/reorder`. Las imágenes llegan **ya ordenadas**; el frontend NO debe reordenarlas. `images[0]` es siempre la portada.
- **`Property.expensas`** (int nullable, **siempre en pesos**) y **`Property.aptoMascotas`** (bool, default false), ambos opcionales al crear/editar. Más `minExpensas`/`maxExpensas` en `GET /properties/filter`.

---

## N1 - Moneda por propiedad (`currency`)
- Fecha: 2026-08-08
- Archivo(s) modificado(s): `src/modules/properties/dto/enumsStatusProperty.ts` (enum `Currency` nuevo), `entities/property.entity.ts`, `dto/create-property.dto.ts`, `dto/update-property.dto.ts`, `src/migrations/1786190400000-AddPropertyCurrency.ts` (nueva)
- Qué faltaba: `price` era un número sin unidad. La moneda vivía únicamente como el texto `"USD"` escrito a mano en 9 vistas del frontend, así que una propiedad publicada en pesos se mostraba —y se compartía por WhatsApp— como si fueran dólares. No había forma de corregirlo sin una columna.
- Qué se implementó: columna `currency` (`enum` de Postgres `property_currency_enum`, `NOT NULL DEFAULT 'USD'`). Opcional en `CreatePropertyDto` con el default resuelto por inicializador de propiedad (`plainToInstance` instancia la clase, así que el inicializador corre y el campo llega poblado al `repo.create(dto)`); opcional **sin default** en `UpdatePropertyDto`, porque en un PATCH "no vino" tiene que significar "no lo toques".
- Decisiones: **el default es USD, no ARS** — todo el catálogo existente está en dólares, así que el `ALTER TABLE ... DEFAULT 'USD'` deja las filas viejas correctas y **no hace falta backfill**. `currency` **NO aplica a `expensas`** (ver N3).
- Estado: ✅ Implementado y verificado con `npm run build`

## N2 - Orden explícito de las imágenes (`order` + endpoint de reorder)
- Fecha: 2026-08-08
- Archivo(s) modificado(s): `src/modules/ImagesProperty/entities/ImagesPropertyEntity.ts`, `propertyImages.service.ts`, `propertyImages.controller.ts`, `Dto/ReorderImagesDto.ts` (nuevo), `src/modules/properties/properties.service.ts`, `src/migrations/1786190500000-AddPropertyImageOrder.ts` (nueva)
- Qué faltaba: no existía ningún campo de orden. Las imágenes salían del `leftJoinAndSelect` **sin `ORDER BY`**, o sea en el orden que quisiera devolver Postgres, y lo único que el admin podía elegir era cuál era la portada (`isCover`).
- Qué se implementó:
  - Columna `order` (`integer NOT NULL DEFAULT 0`).
  - `PATCH /property-images/:propertyId/reorder` con body `{ imageIds: number[] }` (los ids en el orden deseado; el índice **es** el `order`). Corre dentro de una transacción.
  - `GET /properties/:id` ordena con `ORDER BY images.order ASC, images.id ASC` en la query.
  - `GET /properties` y `/properties/filter` ordenan **en memoria** (`sortImages()`), porque usan `skip`/`take` y la paginación `DISTINCT` de TypeORM rechaza ordenar por una columna de la relación joineada.
  - `createMany()` encola las nuevas después del `MAX(order)` existente. `setAsCover()` ahora **también** mueve la imagen a `order = 0`. `ensureCoverExists()` y `setNextImageAsCover()` pasaron de `id ASC` a `order ASC, id ASC`.
- Decisiones:
  - **INVARIANTE `order === 0` ⇔ `isCover`.** No son dos controles independientes. Se eligió así para que no puedan contradecirse: con la estrella y el arrastre por separado, la portada podía quedar 4ª en la galería y el catálogo mostraría una foto distinta de la que abre el detalle.
  - **El body manda ids sueltos, no `{id, order}`.** La posición ya está en el índice del array; el par explícito sería redundante y además puede llegar inconsistente (dos `order: 0`, huecos, negativos). Con ids sueltos ese estado inválido es irrepresentable.
  - **Se exige la lista COMPLETA de imágenes de la propiedad** (400 si faltan, sobran o hay repetidas). Aceptar un subconjunto obligaría a inventar una regla implícita para las que faltan, y sin el chequeo de pertenencia mandar el id de una imagen de OTRA propiedad la reordenaría desde esta URL (IDOR).
  - **El borrado no renumera**: quedan huecos (`0, 1, 3`). Solo importa el orden relativo, y renumerar exigiría un UPDATE de toda la galería en cada borrado.
- ⚠️ Migración de DATOS: el backfill numera cada galería `0..n-1` con `ROW_NUMBER() OVER (PARTITION BY "propertyId" ORDER BY "isCover" DESC, "id" ASC)`. Sin él, todas las imágenes existentes quedarían empatadas en `order = 0`.
- Estado: ✅ Implementado y verificado con `npm run build`

## N3 - Expensas y Apto Mascotas
- Fecha: 2026-08-08
- Archivo(s) modificado(s): `src/modules/properties/entities/property.entity.ts`, `dto/create-property.dto.ts`, `dto/update-property.dto.ts`, `dto/property-filter.dto.ts`, `properties.service.ts`, `src/migrations/1786190600000-AddPropertyExpensasAndPets.ts` (nueva)
- Qué faltaba: dos datos que la inmobiliaria carga a mano en la descripción y que no eran filtrables ni mostrables de forma estructurada.
- Qué se implementó: `expensas` (`integer` nullable) y `aptoMascotas` (`boolean NOT NULL DEFAULT false`), ambos `@IsOptional()` en create y update. Más `minExpensas`/`maxExpensas` en `PropertyFilterDto` y en `filter()`.
- Decisiones:
  - **`expensas` es SIEMPRE en pesos, sin columna de moneda propia.** No es una simplificación: en el mercado local el inmueble se publica en dólares y las expensas se cobran en pesos. Una casa de USD 85.000 no tiene expensas de USD 45.000. Un `expensasCurrency` además rompería el filtro de rango (compararía montos en monedas distintas).
  - **`integer` y no `numeric`/`decimal`**: son montos mensuales redondeados, y un `decimal` de TypeORM vuelve como **string** en el JSON, lo que obligaría a parsear en el frontend y a documentar la rareza.
  - **Nullable con sentido**: `null` = "no informadas", distinto de `0` = "no tiene expensas". El frontend no renderiza la fila cuando es `null`, en vez de mostrar "Expensas: —" (una casa nunca tiene expensas).
  - **`expensas: null` en el PATCH BORRA el valor.** `@IsOptional()` saltea la validación tanto con `undefined` como con `null`, y `@Type(() => Number)` de class-transformer devuelve `null` tal cual (no lo convierte a `0`). Es la única forma de desasignar unas expensas ya cargadas.
  - **`minExpensas` y `maxExpensas` tratan los NULL distinto, a propósito.** `minExpensas` excluye las propiedades sin expensas (`NULL >= x` es falso). `maxExpensas` las **incluye** (`p.expensas IS NULL OR p.expensas <= :max`): quien pone un tope está limitando su gasto mensual y una propiedad sin expensas es el mejor caso posible para ese criterio — esconderla sería lo contrario de lo que pidió.
  - **`aptoMascotas` lleva `default: false` explícito**, a diferencia de `garage`/`patio` (NOT NULL sin default, herencia del esquema original): sin él el `ALTER TABLE` fallaría sobre las filas existentes.
- ⚠️ Nada que backfillear: no existe ningún dato previo del que se pueda inferir ninguno de los dos. `false`/`null` son los valores honestos para el catálogo anterior. `src/scripts/backfill-property-fields.ts` **NO se tocó** a propósito: fabrica datos de ejemplo, y inventar expensas o "apto mascotas" sobre propiedades reales sería publicar información falsa.
- Estado: ✅ Implementado y verificado con `npm run build`

---

# Tanda original (AUDIT.md)

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
