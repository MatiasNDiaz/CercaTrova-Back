# API_CONTRACT.md — Contrato técnico exacto de CercaTrova-Back

> Regenerado desde cero por lectura directa del código fuente actual (`main.ts`, `app.module.ts`, todos los controllers, services, DTOs, entidades, guards, pipes y middlewares), tras la sesión de correcciones del 2026-08-03/04 (ver `TestAPI.md`).
>
> Documento de **solo lectura**: describe la forma real de la API tal como responde HOY, no la intención ni el diseño deseado.

## Novedades de la sesión 2026-08-08 (3 funcionalidades nuevas)

Ver `FEATURES.md` para el detalle de implementación de cada una.

| # | Novedad | Dónde |
|---|---|---|
| A | **`Property.currency`** (`'ARS' \| 'USD'`, NOT NULL, default `'USD'`) — el precio deja de ser un número sin unidad. Viaja en las 3 lecturas públicas. Opcional en create (default USD), opcional en update **sin default** (no vino = no se toca). | §2, §5 |
| B | **`PropertyImages.order`** (int, NOT NULL, default 0) + **`PATCH /property-images/:propertyId/reorder`**. `GET /properties/:id`, `/properties` y `/properties/filter` devuelven las imágenes **ordenadas por `order ASC, id ASC`**. La imagen con `order = 0` es además la portada (`isCover`). | §5, §6 |
| C | **`Property.expensas`** (int, nullable) y **`Property.aptoMascotas`** (boolean, default `false`), ambos opcionales en create y update. `expensas` es **siempre en pesos**, sin importar `currency`. Se suman `minExpensas`/`maxExpensas` a `GET /properties/filter`. | §5 |

## Novedades respecto de la versión anterior del documento

La versión previa quedó desactualizada — describía el código de ANTES de la ronda de correcciones de `TestAPI.md`. Cambios verificados contra el código actual:

| # | Novedad | Dónde |
|---|---|---|
| 1 | **`GET /properties` ahora es paginado** — devuelve `{ data, meta }`, ya no un array plano con todas las propiedades. Sin N+1: el `ratingAverage` se resuelve con una query por página, no una por propiedad. | §5 |
| 2 | **`GET /properties/filter` ahora trae `ratingAverage`** en cada item (antes solo lo tenía el detalle) | §5 |
| 3 | **`title` eliminado de `PropertyFilterDto`** — mandarlo ahora es **400** (`forbidNonWhitelisted`), antes se aceptaba y no filtraba nada | §2, §5 |
| 4 | **Datos sensibles del agente filtrados**: `GET /properties`, `/properties/filter` y `/properties/:id` ya NO devuelven el `User` completo del agente (ni de `referredBy`) — solo `{id, name, surname, phone, photo}`. Antes viajaban `email`, `tokenVersion`, `notifyBroadcast`, etc. en un endpoint público. | §5 |
| 5 | **`GET /properties/:id` ya no devuelve `favorites`** (la lista de `user_id` de quiénes marcaron favorita la propiedad) — reemplazado por `favoritesCount: number` | §5 |
| 6 | **La fuga del hash bcrypt en `PATCH /users/me` y `PATCH /users/:id` está corregida** — la respuesta ya nunca incluye `password` | §0, §4 |
| 7 | **`GET /posts/:id/comments` ahora tiene `OptionalJwtAuthGuard`** — el admin ve correctamente los comentarios que ocultó (antes `req.user` quedaba vacío en esa ruta puntual) | §17 |
| 8 | **Bug corregido en `GET /posts/:id/comments`**: ocultar la única respuesta de un comentario ya no hace desaparecer el comentario padre | §17 |
| 9 | **`Notification.type` — campo nuevo** (`NotificationType`, 13 valores). El frontend debería clasificar por acá, no por substrings del texto en español. | §2, §14 |
| 10 | **`favorites`, `POST /ratings/:propertyId` y `POST /search-preferences` ahora exigen rol `USER` de verdad** (`RolesGuard` agregado) — un ADMIN recibe **403** en estas rutas. **Decisión confirmada, no es un bug**: un admin no necesita favoritear/valorar/guardar preferencias desde su cuenta de gestión. | §0, §8, §9, §12, §20 |
| 11 | **`POST /search-preferences` ya no duplica filas** — es un upsert real, reforzado con un índice único en DB (`userId`) | §12 |
| 12 | **Migraciones renombradas/reorganizadas**: el set actual es `InitialSchema` (baseline completo) + `AddNotificationType` + `AddForeignKeyIndexes` + `UniqueSearchPreferencePerUser`. Las 4 migraciones incrementales viejas (`AddPropertySurfaceAndLegalFields`…) quedaron archivadas, fuera de uso. | §0 |
| 13 | **Dos enums muertos eliminados del código**: `enumTypeOfProperty.ts` (`search-preferences`) y `enumsRequest.ts` (`requests`) ya no existen — no los busques ni los importes. | §2 |
| 14 | Índices nuevos en varias tablas (rendimiento, no cambia el contrato de ninguna respuesta) | §0 |

**Ningún enum activo cambió de valor.**

---

## 0. Notas globales (leer antes que todo lo demás)

- **Base URL:** `http://localhost:<PORT>` (`PORT` del `.env`, default `3000`). **Sin prefijo global** (no hay `app.setGlobalPrefix`).
- **Body parser:** JSON estándar de Express/Nest. Un JSON malformado devuelve 400 con texto plano de Express (no el shape JSON de §1) — caso de borde, no ocurre usando `JSON.stringify`.
- **ValidationPipe global** (`main.ts`): `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, `transformOptions: { enableImplicitConversion: true }`.
  - Cualquier campo **no declarado** en el DTO → 400 (rechazado, no ignorado en silencio).
  - Los query params booleanos de `PropertyFilterDto` (`garage`, `patio`, `property_deed`, `tractoAbreviado`, `boleto`) son **strings** `"true"` / `"false"` (`@IsBooleanString`), no booleanos JSON.
- **CORS:** `origin` sale de `FRONTEND_URL` (admite varios separados por coma; fallback `http://localhost:3001`), `credentials: true`, métodos `GET,HEAD,PUT,PATCH,POST,DELETE`. El frontend **debe** mandar `withCredentials: true` (axios) o `credentials: 'include'` (fetch) en **todas** las requests, incluso las públicas — si no, no viajan ni la cookie de sesión ni la de visitante.
- **Cookie de sesión:** nombre exacto **`access_token`**. `httpOnly: true`, `sameSite: 'lax'`, `secure` solo si `NODE_ENV=production`. `maxAge` derivado de `JWT_EXPIRATION_TIME` (default 24 h). **No se puede leer desde JS** — el estado de sesión se obtiene con `GET /auth/me`.
- **Cookie de visitante:** **`ct_vid`**, UUID anónimo que setea `VisitorIdMiddleware` en **todas** las rutas (`forRoutes('*')`). `httpOnly: true`, `sameSite: 'lax'`, `maxAge` 1 año. No contiene datos personales; sirve para no contar diez veces al mismo visitante en las métricas. El frontend no la lee ni la manda a mano.
- **Headers especiales:** ninguno además de las cookies. **No hay `Authorization: Bearer`** — todo pasa por la cookie. `helmet({ contentSecurityPolicy: false })` está activo (agrega `X-Content-Type-Options`, `X-Frame-Options`, HSTS…) pero no requiere nada del cliente.
- **Rate limiting:** global **100 req/min por IP** (`ThrottlerGuard` como `APP_GUARD`). Excepciones:
  - `POST /auth/register`, `POST /auth/login`, `POST /auth/google` → **5 req/min por IP**.
  - `POST /tracking/visit`, `POST /tracking/duration` → **120 req/min por IP**.
- **Fechas:** todos los campos `Date` de TypeORM (`createdAt`, `updatedAt`, `created_at`, `updated_at`) serializan a **string ISO 8601 UTC** (ej. `"2026-07-30T14:32:10.123Z"`).
- **Agregados numéricos de Postgres:** los resultados de `COUNT(*)`, `AVG(...)`, `MIN`, `MAX`, `ROUND` obtenidos con `getRawOne()` / `getRawMany()` / `repo.query()` llegan como **strings**, no números (comportamiento del driver `pg` para no perder precisión en `bigint`/`numeric`).
  - Afecta de lleno al módulo **`stats`** (§16) y a `GET /feedback/search/stats/zones`.
  - **El módulo `statistics` (§19) es la excepción**: convierte todo con `Number(...)` antes de responder, así que ahí sí llegan números reales.
  - Lo mismo aplica a las **columnas `decimal`**: `PropertyRequest.precioEstimado` y `UserSearchFeedback.priceMin`/`priceMax` llegan como **strings**.
  - `GET /properties`, `/properties/filter` y `/properties/:id` **también** resuelven `ratingAverage` con `getRawMany()`/`getRawOne()`, pero el service lo convierte explícitamente con `Number(...)` — llega como número real.
- **`typeOfProperty` es `eager: true`** en `Property` → se incluye automáticamente en **toda** respuesta que contenga una `Property`, sin importar las `relations` pedidas (incluso anidado dentro de `Favorite.property`, `Comment.property`, `Rating.property`).
- **✅ CORREGIDO — `password` de `User`:** columna `select: false` → ausente en casi todas las respuestas. La excepción que existía antes (`PATCH /users/me` y `PATCH /users/:id` devolvían el hash bcrypt cuando el body incluía `password` — en el caso admin, **el hash de otro usuario**) **está corregida**: `UsersService.updateUser()` ahora hace `delete saved.password` antes de devolver, igual que `createUser()`. El campo `password` nunca aparece en ninguna respuesta de este backend.
- **`PropertyImages.property` tiene `@Exclude()` pero el `ClassSerializerInterceptor` NO está registrado globalmente** → el decorador **no tiene efecto**. En `GET /property-images/:id` y `PATCH /property-images/:id/set-cover` el objeto `property` completo **sí aparece** en la respuesta.
- **Datos del agente en respuestas públicas — ✅ CORREGIDO.** `GET /properties`, `GET /properties/filter` y `GET /properties/:id` ya no cargan la relación `agent` (ni `referredBy`) completa. Se proyecta explícitamente `{ id, name, surname, phone, photo }` — **sin `email`, sin `tokenVersion`, sin ningún flag interno**. `GET /properties/:id` tampoco devuelve `favorites` (la lista de `user_id` de terceros); en su lugar trae `favoritesCount: number`.
- **`synchronize`** de TypeORM es `NODE_ENV !== 'production'` → el esquema se sincroniza solo en desarrollo. En producción hay que correr las migraciones de `src/migrations/`: **`InitialSchema`** (baseline completo — crea las 18 tablas desde cero), **`AddNotificationType`**, **`AddForeignKeyIndexes`**, **`UniqueSearchPreferencePerUser`**. Las 4 migraciones incrementales que existían antes (`AddPropertySurfaceAndLegalFields`, `AddPostsFeature`, `AddIsHiddenToComments`, `AddTrackingInfrastructure`) quedaron archivadas en `src/migrations/_archivo_pre_baseline/`, fuera del glob que lee TypeORM — no se ejecutan.
- **Extensión `unaccent` de Postgres:** el arranque intenta `CREATE EXTENSION IF NOT EXISTS unaccent`. Si el usuario de la DB no tiene privilegios, **la app arranca igual** pero todo filtro de texto de `GET /properties/filter` (`barrio`, `localidad`, `provincia`, `zone`, `direccion`, `search`) revienta con error SQL → 500.
- **Admin por defecto:** se crea al arrancar desde `ADMIN_EMAIL`/`ADMIN_PASSWORD`, solo si no existe ya un usuario con ese email. Si `ADMIN_PASSWORD` tiene **menos de 12 caracteres** y el admin todavía no existe, el arranque **aborta**.
- **Variables que abortan el arranque si faltan:** `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `EMAIL_FROM` (detalle completo en §23).

---

## 1. Formato de errores

### 1.a Excepciones HTTP estándar de NestJS

Aplica a `NotFoundException`, `ConflictException`, `ForbiddenException`, `UnauthorizedException`, `BadGatewayException`, `InternalServerErrorException` y `BadRequestException` **cuando se construye con un solo string**.

```json
{
  "statusCode": 404,
  "message": "El usuario no existe",
  "error": "Not Found"
}
```

`error` es el nombre estándar de HTTP para ese status (`"Bad Request"`, `"Unauthorized"`, `"Forbidden"`, `"Not Found"`, `"Conflict"`, `"Bad Gateway"`, `"Internal Server Error"`). `message` es siempre un **string simple**, nunca array.

### 1.b Fallo de `class-validator` (ValidationPipe global o `JsonToDtoPipe`)

```json
{
  "statusCode": 400,
  "message": [
    "email must be an email",
    "password must be longer than or equal to 5 characters"
  ],
  "error": "Bad Request"
}
```

`message` es un **array de strings**, uno por constraint violada. Los mensajes son los de `class-validator` en **inglés**, salvo los DTOs con `message` custom, que aparecen en español dentro del mismo array:

| DTO / campo | Mensaje exacto |
|---|---|
| `UpdateRequestStatusDto.status` | `"Estado inválido. Valores permitidos: enviado, en_revision, aceptado, rechazado"` |
| `CreateRequestPropertyDto.tipoPropiedad` | `"tipoPropiedad inválido. Valores permitidos: Casa, Departamento, Terreno, Local, Oficina, Quinta"` |
| `CreateRequestPropertyDto.tipoOperacion` | `"tipoOperacion inválido. Valores permitidos: Venta, Alquiler, Alquiler temporal"` |
| `CreateRequestPropertyDto.estadoConservacion` | `"estadoConservacion inválido. Valores permitidos: Excelente, Muy bueno, Bueno, Regular, A refaccionar"` |
| `GoogleLoginDto.idToken` (vacío) | `"El idToken de Google es obligatorio"` |
| `PropertyFilterDto.status` | `"status inválido. Valores permitidos: disponible, pendiente, vendida, alquilada, eliminado, en pausa"` |
| `FindPostsDto.sortBy` | `"sortBy inválido. Valores permitidos: recent, oldest, mostLiked"` |
| `StatisticsQueryDto.range` | `"range inválido. Valores permitidos: day, week, month"` |

Un campo extra no declarado en el DTO (`forbidNonWhitelisted`) cae en este mismo shape, con `"property xyz should not exist"`. **Nuevo caso real**: `?title=algo` en `GET /properties/filter` ahora responde `"property title should not exist"` (el campo se eliminó del DTO, ver §5).

### 1.c `JsonToDtoPipe` — campo `data` de los endpoints multipart

Aplica a `POST /properties`, `PATCH /properties/:id` y `POST /posts`.

- `data` ausente, vacío o no-string → `{ "statusCode": 400, "message": "El campo 'data' es obligatorio y debe ser JSON válido", "error": "Bad Request" }`
- `data` no parseable como JSON → `{ "statusCode": 400, "message": "El campo 'data' debe ser JSON válido", "error": "Bad Request" }`
- `data` es JSON válido pero incumple el DTO → shape de §1.b (`message` array).

### 1.d Rate limit excedido (429)

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

**Sin campo `error`** — es la única excepción que no lo trae (no usa el mismo constructor interno). Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` en requests normales; `Retry-After` cuando el bloqueo está activo.

### 1.e Subida de archivo rechazada por multer

Aplica a todo endpoint con `imageUploadOptions` (foto de perfil, imágenes de propiedad, imagen de publicación):

- Mimetype que no empieza con `image/` → `{ "statusCode": 400, "message": "Solo se permiten archivos de imagen (image/*)", "error": "Bad Request" }`
- Archivo de más de **5 MB** → error de multer (`LIMIT_FILE_SIZE`), **no** pasa por el shape de arriba.

### 1.f Error interno no controlado

```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```

Sin `error`. En la práctica los services capturan con `handleServiceError()` y devuelven `InternalServerErrorException(mensajeGenérico)` → shape §1.a. **Nunca** se filtra `error.message` de la base de datos al cliente.

**Caso de borde conocido, sin corregir:** `GET /properties/:id` con un `id` no numérico (ej. `/properties/abc` o `/properties/undefined`) responde **500** genérico en vez de 400/404 — el controller no usa `ParseIntPipe` en esa ruta.

---

## 2. Enums (valores EXACTOS, case-sensitive)

```ts
// ── src/modules/users/enums/role.enum.ts ── User.role, payload del JWT
enum Role { USER = 'user', ADMIN = 'admin' }

// ── src/modules/users/enums/auth-provider.enum.ts ──
// User.authProvider — alimenta la estadística "registros por método"
enum AuthProvider { LOCAL = 'local', GOOGLE = 'google' }

// ── src/modules/properties/dto/enumsStatusProperty.ts ──
enum StatusProperty {
  DISPONIBLE = 'disponible',
  PENDIENTE  = 'pendiente',
  VENDIDO    = 'vendida',     // ⚠️ el KEY dice VENDIDO, el VALUE es 'vendida'
  ALQUILADA  = 'alquilada',
  ELIMINADO  = 'eliminado',
  PAUSADO    = 'en pausa',    // ⚠️ el VALUE lleva un espacio
}

enum OperationType {
  VENTA             = 'venta',
  ALQUILER          = 'alquiler',
  ALQUILER_TEMPORAL = 'temporal',   // ⚠️ NO es 'alquiler_temporal'
}

// Moneda de `Property.price`. Default 'USD' en la columna y en CreatePropertyDto.
// ⚠️ NO aplica a `expensas`, que son SIEMPRE en pesos (ver §5).
enum Currency { ARS = 'ARS', USD = 'USD' }

// ── src/modules/properties/dto/property-filter.dto.ts ──
enum PropertySortBy {
  PRICE     = 'price',
  ANTIQUITY = 'antiquity',
  DATE      = 'date',      // = created_at (default)
  RATING    = 'rating',    // = AVG(ratings.score)
}
// `order` NO es enum: es @IsIn(['ASC','DESC']) — cualquier otro valor → 400

// ── src/modules/PropertyRequest/entities/PropertyRequest.ts ──
enum RequestStatus {
  ENVIADO   = 'enviado',
  REVISION  = 'en_revision',
  ACEPTADO  = 'aceptado',
  RECHAZADO = 'rechazado',
}
// Transiciones válidas (PATCH /property-requests/:id/status). Cualquier otra → 409:
//   enviado      → en_revision | aceptado | rechazado
//   en_revision  → aceptado | rechazado
//   aceptado     → (ninguna: terminal)
//   rechazado    → en_revision
// Cambiar al MISMO estado tampoco es válido.
// ⚠️ El DEFAULT de la columna en la entidad es 'en_revision', pero el service
//    lo IGNORA: `PropertyRequestService.create()` siempre fuerza 'enviado'
//    al crear. La solicitud nace SIEMPRE en 'enviado', nunca en 'en_revision'.

// ── src/modules/PropertyRequest/dto/enumsPropertyRequest.ts ──
// SOLO validan el DTO de entrada; la entidad guarda string libre.
enum TipoPropiedadRequest {
  CASA = 'Casa', DEPARTAMENTO = 'Departamento', TERRENO = 'Terreno',
  LOCAL = 'Local', OFICINA = 'Oficina', QUINTA = 'Quinta',
}
enum TipoOperacionRequest {
  VENTA = 'Venta', ALQUILER = 'Alquiler', ALQUILER_TEMPORAL = 'Alquiler temporal',
}
enum EstadoConservacionRequest {
  EXCELENTE = 'Excelente', MUY_BUENO = 'Muy bueno', BUENO = 'Bueno',
  REGULAR = 'Regular', A_REFACCIONAR = 'A refaccionar',
}

// ── src/modules/posts/dto/post-comment.dto.ts ──
enum PostSortBy {
  RECENT     = 'recent',      // default
  OLDEST     = 'oldest',
  MOST_LIKED = 'mostLiked',   // ⚠️ camelCase, no 'most_liked'
}

// ── src/modules/statistics/dto/statistics-query.dto.ts ──
enum StatsRange { DAY = 'day', WEEK = 'week', MONTH = 'month' }  // default: month

// ── src/modules/requests/… ── enums del feedback anónimo (DISTINTOS de los de arriba)
// Declarados DOS VECES idénticos: en request.entity.ts y en create-request.dto.ts
enum OperationType_Feedback {   // nombre real: OperationType — solo 2 valores, sin 'temporal'
  ALQUILER = 'alquiler', VENTA = 'venta',
}
enum PropertyTypeEnum {
  CASA = 'casa', DEPARTAMENTO = 'departamento', TERRENO = 'terreno',
  LOCAL = 'local', OFICINA = 'oficina',
}

// ── src/modules/notifications/entities/notification.entity.ts ──
type NotificationTargetRole = 'user' | 'admin';   // no es enum, es union type

// ── src/modules/notifications/enums/notification-type.enum.ts ── ⚠️ NUEVO ──
// `targetRole` decide EN QUÉ FEED aparece la notificación; `type` decide CÓMO
// se muestra (ícono/color/navegación). Columna varchar, no enum de Postgres.
enum NotificationType {
  // Feed del usuario (targetRole: 'user')
  PROPIEDAD_MATCH       = 'propiedad_match',        // propiedad nueva que matchea SearchPreference
  NUEVA_PROPIEDAD       = 'nueva_propiedad',         // broadcast de propiedad nueva
  CAMBIO_PRECIO         = 'cambio_precio',           // baja de precio
  NUEVA_PUBLICACION     = 'nueva_publicacion',       // nuevo post del feed social
  RESPUESTA_COMENTARIO  = 'respuesta_comentario',    // alguien respondió tu comentario en un post
  ESTADO_SOLICITUD      = 'estado_solicitud',        // cambio de estado de una PropertyRequest

  // Feed del admin (targetRole: 'admin')
  ADMIN_NUEVO_USUARIO          = 'admin_nuevo_usuario',
  ADMIN_NUEVO_COMENTARIO       = 'admin_nuevo_comentario',       // comentario en una Property
  ADMIN_NUEVA_VALORACION       = 'admin_nueva_valoracion',
  ADMIN_NUEVA_SOLICITUD        = 'admin_nueva_solicitud',        // nueva PropertyRequest
  ADMIN_NUEVO_FAVORITO         = 'admin_nuevo_favorito',
  ADMIN_COMENTARIO_PUBLICACION = 'admin_comentario_publicacion', // comentario en un Post

  // Fallback — ningún generador actual lo produce; existe para las filas
  // viejas que un backfill no haya podido clasificar y como default en DB.
  GENERICA = 'generica',
}

// ⚠️ ELIMINADOS del código (existían en la versión anterior de este documento,
//    YA NO EXISTEN — no los importes ni los busques):
//   - src/modules/search-preferences/dto/enumTypeOfProperty.ts  (enum typeOfProperty)
//   - src/modules/requests/dto/enumsRequest.ts                  (propertyType / operationType)
```

**`PropertyType` (los "tipos de propiedad") NO es un enum** — es una entidad de base de datos dinámica `{ id: number; name: string }`. Los valores válidos se obtienen en runtime con `GET /property-types`.

---

## 3. Módulo `auth`

| Método | Ruta | Auth | Throttle |
|---|---|---|---|
| POST | `/auth/register` | — | 5/min |
| POST | `/auth/login` | — | 5/min |
| POST | `/auth/google` | — | 5/min |
| GET | `/auth/me` | JWT | global |
| POST | `/auth/logout` | JWT | global |

### POST /auth/register

Body (`RegisterDto`):

```ts
{
  name: string;      // @IsString
  surname: string;   // @IsString
  phone: string;     // @IsString (string, no número)
  photo?: string;    // @IsOptional @IsString (URL)
  email: string;     // @IsEmail — se trimea y pasa a minúsculas antes de validar
  password: string;  // @IsString @MinLength(5)
}
```

Response **201**: el `User` creado **sin `password`**, con `id`, `role: "user"`, `authProvider: "local"`, `profileIncomplete: false`, `notifyBroadcast: true`, `tokenVersion: 0`, `createdAt`, `updatedAt`.

**No** setea cookie ni loguea — hay que llamar a `/auth/login` después.

Errores:
- Email ya registrado → **400** `"No se pudo completar el registro. Verificá los datos ingresados."` (mensaje genérico anti-enumeración; el mismo si la colisión ocurre por carrera contra la constraint UNIQUE).
- Validación → §1.b · Rate limit → §1.d.

**Efecto lateral:** notifica al admin del alta (background, `type: admin_nuevo_usuario`).

### POST /auth/login

Body (`LoginDto`): `{ email: string /* @IsEmail, trim+lowercase */, password: string /* @MinLength(5) */ }`

Response **201**: `{ "message": "Login exitoso", "user": User }` — el `User` **sin `password`** pero **con `tokenVersion`**. Setea la cookie `access_token`.

Errores:
- Email inexistente, usuario sin contraseña local (alta por Google) o contraseña incorrecta → **401** `"Credenciales inválidas"` (los tres casos con el mismo mensaje, a propósito).

### POST /auth/google

Body (`GoogleLoginDto`): `{ idToken: string }` — el **ID token** de Google (JWT de OpenID), **no** un `access_token` ni un `code`.

Response **201**: `{ "message": "Login con Google exitoso", "user": User }` + cookie. Si el email no existía, crea el usuario con `authProvider: "google"`, `profileIncomplete: true`, `password: ''` y `phone: ''`.

Errores:
- Token no verificable → **400** `"No se pudo verificar el token de Google"`
- Payload sin email → **400** `"Token inválido"`
- `aud` distinto del `GOOGLE_CLIENT_ID` → **401** `"El token no fue emitido para esta aplicación"`
- `email_verified !== true` → **401** `"El email de la cuenta de Google no está verificado"`

### GET /auth/me

Sin body. Response **200**: el `User` completo sin `password`.
Error: **400** `"Usuario no encontrado"` si el id del token ya no está en la DB (en la práctica `JwtStrategy` corta antes con **401** `"Sesión inválida"`).

### POST /auth/logout

Requiere sesión **válida** (sin ella → 401). Incrementa `tokenVersion` → invalida **todos** los JWT emitidos hasta ese momento para ese usuario. Borra la cookie con los mismos atributos con que se seteó.

Response **201**: `{ "message": "Logout exitoso" }`

---

## 4. Módulo `users`

| Método | Ruta | Auth |
|---|---|---|
| POST | `/users` | **Ninguna** (público) |
| PATCH | `/users/:id/photo` | JWT (dueño o admin) |
| GET | `/users` | JWT + **ADMIN** |
| GET | `/users/:id` | JWT (cualquier rol) |
| PATCH | `/users/me` | JWT |
| PATCH | `/users/:id` | JWT (dueño o admin) |
| DELETE | `/users/:id` | JWT + **ADMIN** |

Entidad `User` tal como se devuelve:

```ts
{
  id: number;
  name: string;
  surname: string | null;
  phone: string | null;
  photo: string | null;
  email: string;
  profileIncomplete: boolean;         // true en altas por Google sin completar
  role: 'user' | 'admin';
  authProvider: 'local' | 'google';
  notifyBroadcast: boolean;           // opt-out de emails masivos (default true)
  tokenVersion: number;
  createdAt: string;                  // ISO
  updatedAt: string;                  // ISO
  // password: NUNCA presente — ver nota de §0. Corregido 2026-08-03/04.
}
```

⚠️ **`GET /users/:id` no valida ownership ni rol** — cualquier usuario logueado puede leer el perfil de cualquier otro (nombre, teléfono, email). Sigue así hoy; es un hallazgo abierto sin resolver (ver `TestAPI.md`, punto 9).

### POST /users
Público, sin guards. Body = `CreateUserDto` (idéntico a `RegisterDto` pero con `photo` opcional y **sin** posibilidad de mandar `role`). Response **201**: `User` sin `password`. Errores: igual que `/auth/register`. **Sin rate limit propio** (usa el global de 100/min, no el estricto de 5/min de `/auth/register`).

### PATCH /users/:id/photo
`multipart/form-data`, campo **`file`**. Máx **5 MB**, solo `image/*`.
Un usuario solo puede cambiar su propia foto; el admin, la de cualquiera.

Response **200**: el `User` actualizado con `photo` = URL de Cloudinary.
Errores: **403** `"No tienes permiso para editar este perfil"` · **400** `"Usuario no encontrado"` · **400** `"No se proporcionó ninguna imagen"` · **502** `"No pudimos procesar la imagen, intentá de nuevo"` (Cloudinary caído) · §1.e.

### GET /users
Solo ADMIN. Response **200**: `User[]` (sin relaciones).

### GET /users/:id
Cualquier usuario logueado — **no** valida que sea el propio perfil. Response **200**: `User`. Error: **404** `"El usuario no existe"`.

### PATCH /users/me
El id sale **siempre del token** (sin parámetro de URL → sin superficie de IDOR). Body (`UpdateUserDto`, todos opcionales):

```ts
{ name?: string; surname?: string; phone?: string; photo?: string;
  email?: string; password?: string; notifyBroadcast?: boolean }
```

Response **200**: el `User` actualizado, **sin `password`** (ver §0).
- Si se mandó `password`: se hashea, **`tokenVersion` se incrementa** (revoca todas las sesiones) y **esta misma respuesta borra la cookie** → hay que volver a loguearse.
- Si el usuario tenía `profileIncomplete: true` y ahora tiene `password` **y** `phone`, el flag pasa a `false`.

Errores: **404** `"El usuario no existe"` · **409** `"Ese email no está disponible"`.

### PATCH /users/:id
Igual al anterior pero con id explícito. Requiere ser el dueño o admin → si no, **403** `"No tienes permiso para actualizar este usuario"`.
La cookie **solo** se borra si quien llama es el propio usuario; si es un admin editando a otro, la sesión del admin no se toca (la del usuario afectado igual queda revocada por el `tokenVersion++`, pero desde otro navegador).
**Sin `password` en la respuesta** en ningún caso, incluido cuando un admin le cambia la contraseña a otro usuario (antes se filtraba el hash del usuario afectado; corregido).

### DELETE /users/:id
Solo ADMIN. Borra primero las `property_requests` del usuario, después el usuario (el resto cae por CASCADE), y por último intenta limpiar la foto en Cloudinary (best-effort: si falla, no afecta la respuesta).

Response **200**: `{ "message": "Usuario eliminado correctamente por el administrador" }` · Error: **404** `"El usuario no existe"`.

---

## 5. Módulo `properties`

Guards a nivel de clase: `JwtAuthGuard` + `RolesGuard`. Las lecturas están abiertas con `@Public()`.

| Método | Ruta | Auth |
|---|---|---|
| GET | `/properties` | Público |
| GET | `/properties/filter` | Público (+ `OptionalJwtAuthGuard`) |
| GET | `/properties/filters/locations` | Público |
| GET | `/properties/:id` | Público (+ `OptionalJwtAuthGuard`) |
| POST | `/properties` | JWT + **ADMIN** |
| PATCH | `/properties/:id` | JWT + **ADMIN** |
| DELETE | `/properties/:id` | JWT + **ADMIN** |
| DELETE | `/properties/image/:id` | JWT + **ADMIN** |

Entidad `Property` tal como se devuelve **en las lecturas públicas** (`GET /properties`, `/properties/filter`, `/properties/:id`):

```ts
{
  id: number;
  title: string;
  description: string;
  provincia: string;
  localidad: string;
  barrio: string;
  direccion: string | null;      // nullable — propiedades viejas no lo tienen
  zone: string;
  rooms: number;
  bathrooms: number;
  property_deed: boolean;        // escritura
  tractoAbreviado: boolean;
  boleto: boolean;
  garage: boolean;
  patio: boolean;
  aptoMascotas: boolean;         // NOT NULL, default false
  supTotal: number | null;
  supCubierta: number | null;
  antiquity: number;
  price: number;
  expensas: number | null;       // mensuales, SIEMPRE EN PESOS (no sigue a `currency`)
  currency: Currency;            // 'ARS' | 'USD' — NOT NULL, default 'USD'
  status: StatusProperty;
  operationType: OperationType;
  created_at: string; updated_at: string;
  typeOfProperty: { id: number; name: string };   // SIEMPRE presente (eager)
  images?: PropertyImages[];
  ratingAverage: number;          // ⚠️ en las 3 lecturas públicas ahora

  /** 🔒 SOLO estos campos del agente — nunca el User completo (ver §0). */
  agent?: { id: number; name: string; surname: string | null; phone: string | null; photo: string | null };

  // Solo en GET /properties/:id:
  comments?: Comment[];           // incluye TODOS, también los isHidden: true
  ratings?: Rating[];
  favoritesCount?: number;        // ⚠️ reemplaza a `favorites` (lista de user_id) — YA NO se expone
  referredBy?: { id: number; name: string; surname: string | null; phone: string | null; photo: string | null } | null;
}
```

Los tres campos de documentación legal (`property_deed`, `tractoAbreviado`, `boleto`) son **independientes** — cualquier combinación es válida.

**`currency`, `expensas` y `aptoMascotas` viajan en las TRES lecturas públicas** (`GET /properties`, `/properties/filter`, `/properties/:id`) sin que haya que pedirlos: las queries seleccionan la entidad `Property` completa, sin lista de columnas.

- **`currency`** es `NOT NULL` con default `'USD'`, así que **nunca llega `null` ni `undefined`** — ni siquiera en las propiedades creadas antes de que la columna existiera (el `ALTER TABLE ... DEFAULT 'USD'` las dejó pobladas).
- **`expensas`** es `number | null`. ⚠️ **Siempre en pesos, sin importar `currency`** — en el mercado local el inmueble se publica en dólares y las expensas se cobran en pesos, así que NO tiene moneda propia. `null` significa "no informadas" y es distinto de `0` ("no tiene expensas"): el frontend no debe renderizar la fila cuando es `null`, en vez de mostrar "Expensas: —".
- **`aptoMascotas`** es `NOT NULL` con default `false`. Todo el catálogo previo a la columna quedó en `false` — es el valor honesto, nadie declaró lo contrario, pero **no equivale a "no acepta mascotas" verificado**.

⚠️ **`comments` en `GET /properties/:id` incluye los comentarios ocultos** (`isHidden: true`) sin distinguir por rol del que consulta — a diferencia de `GET /properties/:propertyId/comments` (§10), que sí los filtra. Si se necesita la lista pública correcta de comentarios, usar ese endpoint dedicado, no el array embebido en la propiedad.

### GET /properties

⚠️ **CAMBIO DE CONTRATO.** Query params (`PropertyPaginationDto`): `page` (int ≥1, default 1), `limit` (int 1–100, default 10) — **cualquier otro campo → 400**.

Response **200**:

```ts
{
  data: Property[];    // con typeOfProperty, images, agent (campos públicos) y ratingAverage
  meta: {
    totalItems: number;
    itemCount: number;
    totalPages: number;
    currentPage: number;
  }
}
```

**Antes** devolvía un array plano con **todas** las propiedades y hacía una query de promedio por cada una (N+1). Ahora está paginado (10 por página por defecto) y el `ratingAverage` de toda la página se resuelve con una sola query. Orden: `created_at DESC`, fijo (sin `sortBy` — para eso está `/properties/filter`).

Error: **500** `"No se pudieron obtener las propiedades"`.

### GET /properties/filter

Query params (`PropertyFilterDto`, todos opcionales):

| Grupo | Params |
|---|---|
| Orden | `sortBy` (`price`\|`antiquity`\|`date`\|`rating`), `order` (`ASC`\|`DESC`) |
| Paginación | `page` (int ≥1, default 1), `limit` (int 1–100, default 10) |
| Texto | `zone`, `provincia`, `localidad`, `barrio`, `direccion`, `search` |
| Numéricos exactos | `rooms`, `bathrooms`, `typeOfPropertyId` |
| Rangos | `minPrice`, `maxPrice`, `minSupTotal`, `maxSupTotal`, `minSupCubierta`, `maxSupCubierta`, `minExpensas`, `maxExpensas`, `maxAntiquity` |
| Booleanos (**string** `"true"`/`"false"`) | `garage`, `patio`, `property_deed`, `tractoAbreviado`, `boleto` |
| Otros | `status` (enum), `operationType` (enum) |

⚠️ **`title` fue eliminado del DTO.** Mandarlo ahora responde **400** (`"property title should not exist"`). Antes se aceptaba y no filtraba nada; para buscar por título usar `search`, que sí lo incluye.

Response **200**:

```ts
{
  data: Property[];              // con typeOfProperty, images, agent (campos públicos) y ratingAverage
  meta: {
    totalItems: number;
    itemCount: number;
    totalPages: number;
    currentPage: number;
  }
}
```

⚠️ **`ratingAverage` ahora viene en cada item** (antes había que pedir el detalle o `GET /properties` para tenerlo).

Comportamientos que hay que conocer:

- ⚠️ **`minExpensas` y `maxExpensas` tratan los `NULL` distinto, a propósito.** `minExpensas` **excluye** las propiedades sin expensas cargadas (`NULL >= x` es falso: no cumplen "al menos X"). `maxExpensas` las **incluye** (`p.expensas IS NULL OR p.expensas <= :max`): quien pone un tope está limitando su gasto mensual, y una propiedad sin expensas es el mejor caso posible para ese criterio — esconderla sería lo contrario de lo que pidió.
- **`status` por defecto es `disponible`.** Si no se manda `status`, la query fuerza `p.status = 'disponible'` — no se ven pausadas ni vendidas.
- **Orden default:** `created_at DESC`. `order` distinto de `'ASC'` se trata como `DESC`.
- **`sortBy=rating`** ordena por una subconsulta `COALESCE(AVG(score),0)` con alias `avgscore` — coincide con el `ratingAverage` que ahora viaja en la respuesta.
- **`search` pasa por un parser de lenguaje natural** que extrae del texto, antes de la búsqueda libre:
  - tipo de propiedad (`casa`, `depto/departamento`, `local/comercio/negocio`, `oficina`, `terreno/lote/baldío`) — solo si **no** se mandó `typeOfPropertyId`;
  - operación (`alquiler/renta`, `venta/comprar`) — solo si no se mandó `operationType`;
  - metros cuadrados (`120 m2`, `120 metros`) → `supTotal BETWEEN ±10 %`;
  - habitaciones y baños → solo si no vinieron como filtro explícito (el texto igual se limpia, para que el número no se cuele como búsqueda libre);
  - precio (`150k`, `150 mil`, o cualquier número de 5+ dígitos) → `price BETWEEN ±20 %`;
  - antigüedad (`10 años`) → `antiquity <= 10`.
  - El resto, quitadas las palabras de relleno, se busca con `ILIKE unaccent(...)` en **localidad, barrio, título y descripción** (en ese orden de prioridad).
- Todos los filtros de texto usan `unaccent(...) ILIKE unaccent('%valor%')` → **requieren la extensión `unaccent`** (ver §0).
- **Efecto lateral:** cada llamada registra una fila en `filter_usages` (§18), salvo que quien busque sea ADMIN o que la búsqueda no tenga ningún filtro real.

### GET /properties/filters/locations

Response **200**: `{ localidades: string[]; barrios: string[]; zones: string[] }` — valores `DISTINCT` no vacíos, ordenados alfabéticamente. Sirve para poblar los selects de filtros.

### GET /properties/:id

Response **200**: `Property & { ratingAverage: number; favoritesCount: number }` con `typeOfProperty`, `images`, `comments` (TODOS, incluidos ocultos), `ratings`, `agent` (campos públicos) y `referredBy` (campos públicos, o `null`).

⚠️ **`favorites` ya NO se devuelve** — antes exponía `[{user_id, property_id}, ...]`, es decir qué usuarios marcaron la propiedad como favorita. Reemplazado por `favoritesCount: number`.

Error: **404** `"No existe la propiedad con ID {id}"`.
**Efecto lateral:** registra una fila en `property_views` (§18), salvo que el visitante sea ADMIN.

### POST /properties (ADMIN)

`multipart/form-data`:
- **`data`** → string JSON con `CreatePropertyDto`
- **`images`** → hasta **10** archivos (`image/*`, ≤5 MB c/u)

```ts
// CreatePropertyDto — todos obligatorios SALVO los marcados como opcionales
{
  title: string; description: string;
  typeOfPropertyId: number;
  operationType: OperationType;
  property_deed: boolean; tractoAbreviado: boolean; boleto: boolean;
  provincia: string; localidad: string; barrio: string; direccion: string; zone: string;
  rooms: number; bathrooms: number;
  garage: boolean; patio: boolean;
  aptoMascotas?: boolean;       // OPCIONAL — sin valor queda en `false`
  supTotal: number; supCubierta: number;
  antiquity: number; price: number;
  expensas?: number;            // OPCIONAL, entero ≥ 0, EN PESOS — sin valor queda `null`
  currency?: Currency;          // OPCIONAL — si no viene, el DTO la deja en 'USD'
  status: StatusProperty;
}
```

El `agent` sale del **token del admin que crea** — no se manda en el body.

Response **201**:

```ts
Property & {
  agent: { id: number };   // solo el id — no se recarga con más campos en esta respuesta puntual
  images: { id: number; url: string; hash: string; isCover: boolean; publicId: string }[]
}
```

Errores: **404** `"No existe el tipo de propiedad con ID {n}"` · **502** `"No se pudieron procesar las imágenes. Intentá de nuevo."` (Cloudinary falló; **la propiedad se borra en rollback**) · §1.b / §1.c / §1.e.

**Efecto lateral:** dispara notificaciones in-app + email a los usuarios cuya `SearchPreference` coincide (background — un fallo no afecta la respuesta).

### PATCH /properties/:id (ADMIN)

`multipart/form-data`:
- **`data`** → JSON con `UpdatePropertyDto` (todos los campos opcionales, los mismos de create, más `deleteImages?: number[]` y `setCoverImageId?: number`)

⚠️ **`currency` en el PATCH no tiene default**, a diferencia de create: si no viene en el body, la moneda guardada **queda como está**. Un default `'USD'` acá pasaría a dólares toda propiedad editada desde un formulario que no mande el campo.

⚠️ **Para BORRAR unas expensas ya cargadas hay que mandar `expensas: null`**, no omitir el campo (omitirlo las deja como estaban). `@IsOptional()` de class-validator saltea la validación tanto con `undefined` como con `null`, así que el `null` pasa y llega a la columna. Es la única forma de desasignarlas.
- **`newImages`** → hasta 10 archivos

Orden de operaciones (importa porque los borrados en Cloudinary son irreversibles): 1) sube las nuevas → 2) guarda la propiedad → 3) recién ahí borra las de `deleteImages` → 4) aplica `setCoverImageId` → 5) garantiza que exista una portada.

Response **200**: `Property & { ratingAverage: number; favoritesCount: number }` (mismo shape que `GET /properties/:id`, vía `findOne()`).
Errores: **404** propiedad o tipo inexistente · §1.b / §1.c.
**Efecto lateral:** si `price` cambió, dispara notificación de baja de precio a quien corresponda.

### DELETE /properties/:id (ADMIN)
Response **200**: `{ "message": "Propiedad {id} eliminada correctamente" }`. Borra primero en la DB (CASCADE limpia imágenes, ratings, comentarios y favoritos) y después limpia Cloudinary best-effort. Error: **404**.

### DELETE /properties/image/:id (ADMIN)
Delega en el service de imágenes. Response **200**: `{ "message": "Imagen eliminada correctamente." }`. Si la imagen era portada, se promueve otra automáticamente. Error: **404** `"Imagen no encontrada"`.

---

## 6. Módulo `ImagesProperty` (`/property-images`)

Guards a nivel de clase: `JwtAuthGuard` + `RolesGuard`.

| Método | Ruta | Auth |
|---|---|---|
| GET | `/property-images/:id` | JWT (cualquier rol) |
| PATCH | `/property-images/:propertyId/reorder` | JWT + **ADMIN** |
| PATCH | `/property-images/:id/set-cover` | JWT + **ADMIN** |
| DELETE | `/property-images/:id` | JWT + **ADMIN** |

```ts
interface PropertyImages {
  id: number;
  url: string;
  hash: string | null;      // UNIQUE — evita subir dos veces la misma imagen
  isCover: boolean;
  order: number;            // posición en la galería (0 = primera). NOT NULL, default 0
  publicId: string;         // public_id de Cloudinary
  property?: Property;      // ⚠️ SÍ aparece (el @Exclude() no tiene efecto, ver §0)
}
```

⚠️ **INVARIANTE: `order === 0` ⇔ `isCover === true`.** No son dos controles independientes: la primera imagen de la galería ES la portada. Los tres caminos que asignan orden (`reorder`, `set-cover`, y el backfill de la migración) la mantienen. **No hay endpoint que permita romperla**, así que el frontend puede confiar en `images[0]` tanto como en `.find(i => i.isCover)`.

Las imágenes vienen **ordenadas por `order ASC, id ASC`** en las tres lecturas de propiedades (§5): en `GET /properties/:id` con un `ORDER BY` real en la query, y en `GET /properties` y `/properties/filter` ordenadas en memoria después de traer la página (la paginación `DISTINCT` de TypeORM no admite ordenar por una columna de la relación joineada).

- **GET** → `PropertyImages` con la relación `property` cargada **entera** (esta ruta no pasa por el filtro de campos públicos de §5, porque no usa `PropertiesService`). Error **404** `"Imagen no encontrada"`.
- **PATCH .../set-cover** → `{ message: "Imagen establecida como portada correctamente.", image: PropertyImages }`. ⚠️ **Cambio de comportamiento:** además de marcar `isCover`, ahora **mueve la imagen a `order = 0`** y corre una posición al resto (conservando su orden relativo). Antes solo tocaba el flag, lo que con la columna `order` dejaría la portada en el medio de la galería. Errores: **404** `"Imagen no encontrada"` / `"La imagen no tiene una propiedad asociada"`.
- **DELETE** → `{ message: "Imagen eliminada correctamente." }`. Borra de Cloudinary y de la DB; si era portada, promueve la primera por `order ASC, id ASC` (antes era por `id ASC`). ⚠️ **El borrado NO renumera**: quedan huecos en la secuencia (`0, 1, 3`). Es intencional — el orden relativo es lo que importa, y renumerar obligaría a un UPDATE de toda la galería en cada borrado. Las imágenes nuevas se encolan después del `MAX(order)`, no del `COUNT`.

### PATCH /property-images/:propertyId/reorder (ADMIN)

⚠️ **El parámetro de esta ruta es el id de la PROPIEDAD**, no el de una imagen — es la única del controller donde `:param` no es una imagen.

Body:

```ts
{ imageIds: number[] }   // los ids EN EL ORDEN DESEADO; el índice es el `order`
```

Asigna `order = índice` a cada imagen y marca la de índice 0 como portada. Todo dentro de una transacción: o se aplica el orden completo o no se aplica nada (un fallo a mitad dejaría órdenes duplicados y dos portadas, o ninguna).

**El array tiene que traer TODAS las imágenes de la propiedad**, exactamente una vez cada una. No se acepta un subconjunto: obligaría a inventar una regla implícita para las que faltan, y sin el chequeo de pertenencia mandar el id de una imagen de otra propiedad la reordenaría desde esta URL (IDOR).

Response **200**:

```ts
{
  message: "Orden de las imágenes actualizado correctamente.",
  images: { id: number; order: number; isCover: boolean; url: string }[]
}
```

Errores:
- **404** `"No existe la propiedad con ID {n}"` · `"La propiedad no tiene imágenes para reordenar"`
- **400** `"El orden tiene imágenes repetidas"`
- **400** `"El orden tiene que incluir exactamente las {n} imágenes de la propiedad"` (faltan, sobran, o alguna no es de esta propiedad)
- **400** §1.b si `imageIds` no es un array de enteros no vacío

---

## 7. Módulo `typeOfProperty` (`/property-types`)

Guards de clase: `JwtAuthGuard` + `RolesGuard`. Lecturas `@Public()`.

| Método | Ruta | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/property-types` | Público | — | `{ id, name }[]` |
| GET | `/property-types/:id` | Público | — | `{ id, name }` |
| POST | `/property-types` | **ADMIN** | `{ name: string }` (`@MinLength(3)`) | `{ id, name }` |
| PATCH | `/property-types/:id` | **ADMIN** | `{ name?: string }` | `{ id, name }` |
| DELETE | `/property-types/:id` | **ADMIN** | — | `{ message: "Tipo de propiedad eliminado" }` |

Errores: **404** `"Tipo de propiedad no encontrado."` · **409** `"Ese tipo de propiedad ya existe."` (nombre duplicado) · **409** `"No se puede eliminar: hay propiedades usando este tipo"`.

---

## 8. Módulo `favorites`

⚠️ **CAMBIO DE COMPORTAMIENTO (confirmado, no es un bug).** Guards de clase: `JwtAuthGuard` **+ `RolesGuard`**. Antes faltaba `RolesGuard` y los `@Roles(Role.USER)` eran decorativos — un admin también podía usar estos endpoints. Ahora **el rol se exige de verdad: un ADMIN recibe 403 en las 4 rutas.** Decisión de negocio confirmada el 2026-08-04: un admin no necesita favoritear propiedades desde su cuenta de gestión.

El `userId` sale **siempre del token**, nunca de la URL.

| Método | Ruta | Auth | Response |
|---|---|---|---|
| POST | `/favorites/:propertyId` | JWT + **USER** | El `Favorite` creado |
| GET | `/favorites` | JWT + **USER** | `Favorite[]` con `property`, `property.images`, `property.typeOfProperty` |
| DELETE | `/favorites/all` | JWT + **USER** | `{ message: "Todos los favoritos fueron eliminados" }` |
| DELETE | `/favorites/:propertyId` | JWT + **USER** | `{ message: "Favorito eliminado correctamente" }` |

`/favorites/all` está declarado **antes** de `/:propertyId` para que `"all"` no se interprete como id.

```ts
interface Favorite {
  user_id: number;        // PK compuesta
  property_id: number;    // PK compuesta
  user?: User;
  property?: Property;
}
```

⚠️ **`Favorite` no tiene fecha** — por eso el ranking de "más favoritas" de `/statistics` es histórico y no respeta el rango.

Errores: **404** `"No se encontró al usuario"` / `"No se encontró la propiedad"` / `"El favorito no existe"` / `"Usuario no encontrado"` · **409** `"La propiedad ya está en favoritos"` · **403** `"No tienes permisos para acceder a este recurso"` (usuario con rol distinto de `USER`, es decir un admin).

**Efecto lateral:** al crear un favorito se notifica al admin (background, `type: admin_nuevo_favorito`).

---

## 9. Módulo `ratings`

⚠️ **CAMBIO DE COMPORTAMIENTO (confirmado, no es un bug).** `POST /ratings/:propertyId` ahora lleva `JwtAuthGuard` **+ `RolesGuard`** — antes el `@Roles(Role.USER)` era decorativo y un admin también podía valorar. Ahora un ADMIN recibe **403**.

| Método | Ruta | Auth |
|---|---|---|
| POST | `/ratings/:propertyId` | JWT + **USER** |
| GET | `/ratings/mine` | JWT (cualquier rol) |
| GET | `/ratings/:propertyId` | **Público** (sin guard) |

`/ratings/mine` va declarado **antes** de `/:propertyId`; si no, `ParseIntPipe` respondería 400 con `"mine"`.

### POST /ratings/:propertyId (USER)
Body: `{ score: number }` — `@IsInt @Min(1) @Max(5)`.
Si el usuario ya valoró esa propiedad, **actualiza** la valoración existente (no crea otra).
Response **201**: el `Rating` guardado.
Errores: **400** `"El puntaje debe ser entre 1 y 5"` · **404** `"La propiedad indicada no existe"` · **409** `"Ya valoraste esta propiedad"` (carrera contra la constraint `UNIQUE(userId, propertyId)`) · **403** si quien llama es admin.
**Efecto lateral:** notifica al admin (`type: admin_nueva_valoracion`), tanto en alta como en actualización.

### GET /ratings/mine
Cualquier rol logueado. Response **200**: `Rating[]` del usuario, con `property`, `property.images` y `property.typeOfProperty`, ordenados por `id DESC`. Alimenta "Propiedades que valoré".

### GET /ratings/:propertyId
Público, sin ningún guard. Response **200**:

```ts
{ id: number; score: number; userId: number;
  user: { id: number; name: string; photo: string | null } }[]
```

---

## 10. Comentarios de PROPIEDADES (`/properties/:propertyId/comments`)

Distintos de los comentarios de publicaciones (§17), que son otra entidad y otro controller.

| Método | Ruta | Auth |
|---|---|---|
| POST | `/properties/:propertyId/comments` | JWT |
| GET | `/properties/:propertyId/comments` | **Público** (+ `OptionalJwtAuthGuard`) |
| PATCH | `/properties/:propertyId/comments/:commentId` | JWT (solo el autor) |
| PATCH | `/properties/:propertyId/comments/:commentId/hide` | JWT + **ADMIN** |
| DELETE | `/properties/:propertyId/comments/:commentId` | JWT (autor **o** admin) |

```ts
interface Comment {
  id: number;
  message: string;
  isHidden: boolean;
  created_at: string;
  userId: number;
  propertyId: number;
  user: { id: number; name: string; surname: string | null; photo: string | null };
}
```

### POST
Body: `{ message: string }` — `@IsNotEmpty @MaxLength(500)`. Response **201**: el `Comment` con `property` y `user` completos.
Errores: **404** `"La propiedad no existe"` / `"El usuario no existe"`.
**Efecto lateral:** notifica al admin (`type: admin_nuevo_comentario`).

### GET
**Público**, pero `OptionalJwtAuthGuard` puebla `req.user` si hay sesión: **solo el ADMIN ve los comentarios con `isHidden: true`**; para el resto (y para anónimos) no existen. Orden: `created_at DESC`. Este es el endpoint que da la lista pública **correcta** (a diferencia del array `comments` embebido en `GET /properties/:id`, que trae todo sin filtrar — ver §5).

### PATCH .../:commentId
Body: `{ message?: string }`. Solo el autor.
Errores: **404** `"El comentario no existe"` · **403** `"No podés editar un comentario que no es tuyo"`.

### PATCH .../:commentId/hide (ADMIN)
Sin body — **togglea** la visibilidad.
Response **200**: `{ id: number; isHidden: boolean; message: "Comentario ocultado" | "Comentario visible de nuevo" }`.

### DELETE .../:commentId
El autor o un admin. Response **200**: `{ "message": "Comentario eliminado correctamente" }`.
Error: **403** `"No tenés permiso para eliminar este comentario"`.

---

## 11. `GET /my-comments`

Controller propio (`MyCommentsController`) porque `CommentsController` está anidado bajo una propiedad y esta consulta las cruza todas. Requiere **JWT**; el id sale del token (un `:userId` en la ruta sería un IDOR).

Response **200**: `Comment[]` del usuario logueado con `property`, `property.images` y `property.typeOfProperty`, ordenados por `created_at DESC`.
**Incluye los ocultos** — es contenido propio; la UI los marca.

---

## 12. Módulo `search-preferences`

⚠️ **CAMBIO DE COMPORTAMIENTO (confirmado, no es un bug).** Guard de clase: `JwtAuthGuard` **+ `RolesGuard`** (antes `AuthGuard('jwt')` sin `RolesGuard`). El `@Roles(Role.USER)` del POST ahora se aplica de verdad — un ADMIN recibe **403**.

⚠️ **`POST /search-preferences` ya no duplica filas.** Es un upsert real: si el usuario ya tiene una preferencia guardada, el POST actualiza esa fila en vez de crear una nueva. Reforzado con un índice único en DB sobre `userId`.

| Método | Ruta | Auth |
|---|---|---|
| POST | `/search-preferences` | JWT + **USER** |
| PATCH | `/search-preferences` | JWT (cualquier rol) |
| GET | `/search-preferences` | JWT (cualquier rol) |
| GET | `/search-preferences/user/:id` | JWT + **ADMIN** |

Body (`CreateSearchPreferenceDto` / `UpdateSearchPreferenceDto` — **todos opcionales**):

```ts
{
  zone?: string; localidad?: string; barrio?: string;
  operationType?: OperationType;
  typeOfPropertyId?: number;          // ID de property-types, NO enum
  garage?: boolean; patio?: boolean;
  property_deed?: boolean; tractoAbreviado?: boolean; boleto?: boolean;
  preferredPrice?: number;            // @Min(0)
  minRooms?: number; minBathrooms?: number;
  supTotal?: number; supCubierta?: number;
  maxAntiquity?: number;
  notifyNewMatches?: boolean;         // default true
  notifyPriceDrops?: boolean;         // default true
}
```

`localidad`, `barrio` y `zone` se trimean del lado del servidor.

Response (POST/PATCH) **200/201**: la `SearchPreference` con `typeOfProperty` y `user` cargados.

```ts
interface SearchPreference {
  id: number;
  user: User;
  zone: string | null; localidad: string | null; barrio: string | null;
  operationType: OperationType | null;
  typeOfProperty: { id: number; name: string } | null;   // eager
  property_deed: boolean | null; tractoAbreviado: boolean | null; boleto: boolean | null;
  preferredPrice: number | null;
  minRooms: number | null; minBathrooms: number | null;
  supTotal: number | null; supCubierta: number | null;
  garage: boolean | null; patio: boolean | null;
  maxAntiquity: number | null;
  notifyNewMatches: boolean; notifyPriceDrops: boolean;
  createdAt: string; updatedAt: string;
}
```

Comportamientos a tener en cuenta:
- **`PATCH` sobre un usuario sin preferencias creadas se comporta como `POST`** (crea la fila).
- **`GET /search-preferences` devuelve `null`** (200, no 404) si el usuario todavía no guardó ninguna.
- **Un usuario tiene como máximo una fila**, garantizado por el service (upsert) y por un índice único en DB. Llamar a `POST` repetidas veces ya no duplica ni genera notificaciones repetidas.

Errores: **404** `"Usuario no encontrado"` / `"No existe el tipo de propiedad con ID {n}"` · **403** en `POST` si quien llama no es `USER`, o en `/user/:id` sin rol admin.

---

## 13. Módulo `PropertyRequest` (`/property-requests`)

Guard de clase: `JwtAuthGuard`; las rutas de admin suman `RolesGuard`.

| Método | Ruta | Auth |
|---|---|---|
| POST | `/property-requests` | JWT |
| GET | `/property-requests/my-requests` | JWT (propias) |
| GET | `/property-requests/my-requests/:id` | JWT (propia) |
| GET | `/property-requests` | **ADMIN** |
| GET | `/property-requests/user/:userId` | **ADMIN** |
| GET | `/property-requests/:id` | **ADMIN** |
| PATCH | `/property-requests/:id/status` | **ADMIN** |
| DELETE | `/property-requests/:id` | **ADMIN** |

Body de creación (`CreateRequestPropertyDto`):

```ts
{
  localidad: string; barrio: string; direccion: string;
  pisoDepto?: string;
  tipoPropiedad: TipoPropiedadRequest;           // enum, ver §2
  tipoOperacion: TipoOperacionRequest;           // enum
  estadoConservacion: EstadoConservacionRequest; // enum
  m2Totales: number; m2Cubiertos: number;        // @Min(0)
  habitaciones: number; baños: number;           // ⚠️ "baños" con ñ
  antiguedad: number;
  orientacion?: string;
  patio: boolean; garage: boolean;
  escritura: boolean; impuestosAlDia: boolean; aptoCredito: boolean;
  precioEstimado: number;                        // @Min(0)
  mensajeAgente?: string;
}
```

Entidad devuelta: los mismos campos más `id`, `userId`, `user` (en los endpoints que la cargan), `createdAt` y:

```ts
status: RequestStatus   // se crea SIEMPRE como 'enviado' — el service lo fuerza,
                        // ignorando la default 'en_revision' de la columna
precioEstimado: string  // ⚠️ columna decimal(12,2) → el driver pg la devuelve como STRING
```

- **POST** → **201** con la solicitud creada. Dispara notificación al admin (`type: admin_nueva_solicitud`) y "solicitud recibida" al usuario (`type: estado_solicitud`), ambas en background.
- **GET /my-requests** → `PropertyRequest[]` del usuario, con `user`, orden `createdAt DESC`.
- **GET /my-requests/:id** → una sola, **sin** relación `user`. Errores: **404** `"La solicitud #{id} no existe."` · **403** `"No tenés permiso para ver esta solicitud."`
- **GET /** (ADMIN) → todas, con `user`, orden `createdAt DESC`.
- **GET /user/:userId** (ADMIN) → las de ese usuario.
- **GET /:id** (ADMIN) → una, con `user`. Error **404** `"La solicitud con ID {id} no existe"`.
- **PATCH /:id/status** (ADMIN) → body `{ status: RequestStatus }`. Valida la máquina de estados de §2 → **409** `"No se puede pasar la solicitud de '{actual}' a '{nuevo}'"`. Notifica al usuario (`type: estado_solicitud`).
- **DELETE /:id** (ADMIN) → `{ "message": "Solicitud #{id} eliminada correctamente" }`.

---

## 14. Módulo `notifications`

Guard de clase: `JwtAuthGuard`; las rutas de admin suman `RolesGuard`.

| Método | Ruta | Auth |
|---|---|---|
| GET | `/notifications` | JWT |
| GET | `/notifications/unread-count` | JWT |
| GET | `/notifications/admin` | **ADMIN** |
| PATCH | `/notifications/:id/read` | JWT |
| PATCH | `/notifications/read-all` | JWT |
| PATCH | `/notifications/admin/read-all` | **ADMIN** |

```ts
interface Notification {
  id: number;
  title: string;
  message: string;
  propertyId: number | null;
  read: boolean;
  targetRole: 'user' | 'admin';
  type: NotificationType;         // ⚠️ NUEVO — ver §2 para los 13 valores posibles
  relatedUserId: number | null;   // usuario que originó el evento (en las de admin)
  createdAt: string;
  user?: User;                    // no se carga en los listados
}
```

⚠️ **Campo `type` nuevo.** El frontend debería clasificar por acá (ícono, color, a dónde navega), no por substrings del texto en español — el texto puede cambiar de redacción sin previo aviso. Las notificaciones históricas (creadas antes de esta migración) fueron reclasificadas automáticamente por título en el backfill de la migración `AddNotificationType`; cualquier título que no matcheara quedó en `type: 'generica'`.

- **GET /notifications** → **solo** las del usuario logueado con `targetRole: 'user'`, orden `createdAt DESC`. Los dos feeds (usuario/admin) son disjuntos.
- **GET /notifications/unread-count** → `{ count: number }`. Resuelve por el **rol del token**: para admin cuenta las `targetRole: 'admin'` no leídas; para el resto, las propias con `targetRole: 'user'`. Un solo endpoint sirve a los dos roles.
- **GET /notifications/admin** (ADMIN) → todas las de `targetRole: 'admin'`, orden `createdAt DESC`.
- **PATCH /:id/read** → `{ "message": "Notificación marcada como leída" }`. Un usuario común solo puede marcar las suyas; el admin puede además marcar cualquiera con `targetRole: 'admin'`. Si no matchea nada → **404** `"Notificación no encontrada"`.
- **PATCH /read-all** → `{ "message": "Todas las notificaciones marcadas como leídas" }`. Marca **todas las del usuario**, sin distinguir `targetRole`.
- **PATCH /admin/read-all** (ADMIN) → `{ "message": "Todas las notificaciones del admin marcadas como leídas" }`.

**Eventos que generan notificaciones** (todos en background — un fallo nunca rompe la operación principal):

| Evento | `type` | Al usuario | Al admin |
|---|---|---|---|
| Alta de usuario (formulario o Google) | `admin_nuevo_usuario` | — | ✅ |
| Nueva propiedad que matchea una `SearchPreference` | `propiedad_match` | ✅ in-app + email | — |
| Nueva propiedad (broadcast general) | `nueva_propiedad` | ✅ in-app + email | — |
| Baja de precio de una propiedad que matchea | `cambio_precio` | ✅ in-app + email | — |
| Nueva publicación (`POST /posts`) | `nueva_publicacion` | ✅ in-app + email | — |
| Comentario en una propiedad | `admin_nuevo_comentario` | — | ✅ |
| Comentario en una publicación | `admin_comentario_publicacion` | — | ✅ (salvo que comente el propio admin) |
| Respuesta a un comentario de publicación | `respuesta_comentario` | ✅ al autor del comentario | — |
| Valoración (alta o cambio) | `admin_nueva_valoracion` | — | ✅ |
| Favorito nuevo | `admin_nuevo_favorito` | — | ✅ |
| Solicitud de publicación creada | `estado_solicitud` (usuario) / `admin_nueva_solicitud` (admin) | ✅ "recibida" | ✅ |
| Cambio de estado de una solicitud | `estado_solicitud` | ✅ | — |

Los **emails masivos** respetan el opt-out `User.notifyBroadcast`; las notificaciones **in-app se envían igual**.

---

## 15. Módulo `requests` — feedback de búsqueda anónimo (`/feedback/search`)

Sin guard de clase. Las rutas de admin declaran `AuthGuard('jwt')` + `RolesGuard`.

| Método | Ruta | Auth |
|---|---|---|
| POST | `/feedback/search` | **Público** |
| GET | `/feedback/search/check/:deviceId` | **Público** |
| GET | `/feedback/search/stats/zones` | **ADMIN** |
| GET | `/feedback/search` | **ADMIN** |
| GET | `/feedback/search/:id` | **ADMIN** |

Body (`CreateUserSearchFeedbackDto`):

```ts
{
  rooms?: number; bathrooms?: number;
  zone?: string; localidad?: string; barrio?: string;
  priceMin?: number; priceMax?: number;
  propertyType?: PropertyTypeEnum;        // 'casa'|'departamento'|'terreno'|'local'|'oficina'
  operationType?: OperationType_Feedback; // 'alquiler'|'venta' (SIN 'temporal')
  antiquityMax?: number;
  hasGarage?: boolean; hasPatio?: boolean;
  notes?: string;
  deviceId: string;   // OBLIGATORIO, @IsUUID('4')
}
```

- **POST** → **201** `{ message: "Preferencias guardadas. ¡Gracias por ayudarnos a mejorar!", id: number }`.
  Anti-spam: **1 envío por `deviceId` cada 24 h** → si no, **400** `"Ya hemos recibido tu búsqueda. Puedes enviar otra en 24 horas."`
  Si falta `deviceId` → **400** `"El deviceId es obligatorio para evitar spam."`
- **GET /check/:deviceId** → `{ canSend: boolean; nextAllowed: string | null }` (ISO).
- **GET /stats/zones** (ADMIN) → `{ topZones: { name, value }[]; topTypes: { type, total }[]; totalRequests: number }` — ⚠️ `value` y `total` son **strings** (raw Postgres); `totalRequests` sí es número.
- **GET /** (ADMIN) → `UserSearchFeedback[]`, orden `createdAt DESC`. `priceMin`/`priceMax` son **strings** (columnas `decimal`).
- **GET /:id** (ADMIN) → uno. Error **404** `"No se encontró el registro con ID {id}"`.

⚠️ **Nota (no un bug, dato de contexto):** al momento de escribir esta versión del documento, la tabla `user_search_feedback` estaba **vacía** (0 filas) — nadie usa este formulario. Los 22 endpoints de `/stats/*` (§16), que solo leen de esta tabla, devuelven listas vacías o ceros. Candidatos a revisar/eliminar junto con el módulo `stats` — ver `TestAPI.md`, sección de endpoints sin consumidor conocido.

---

## 16. Módulo `stats` (métricas sobre `user_search_feedback`)

**Todo el controller es JWT + ADMIN** (guards y `@Roles` a nivel de clase). Todos GET, sin body ni params.

⚠️ **Casi todos los valores numéricos son strings** (raw Postgres, §0). Las únicas excepciones son los guards de "sin datos", que devuelven números literales `0`.

⚠️ Este módulo mide el **formulario de feedback manual** (`user_search_feedback`), NO las búsquedas reales del catálogo. Para eso está `/statistics` (§19). Los dos coexisten y no comparten datos. Ver nota de §15 sobre la tabla vacía.

| Ruta | Response (`[]` si no hay datos, salvo lo indicado) |
|---|---|
| `GET /stats/property-type` | `{ propertyType: string\|null; count: string; percentage: string }[]` |
| `GET /stats/property-type/top` | `{ propertyType: string\|null; count: string } \| undefined` |
| `GET /stats/property-type/least` | `{ propertyType: string\|null; count: string } \| undefined` |
| `GET /stats/operation-type` | `{ operationType: string\|null; count: string; percentage: string }[]` |
| `GET /stats/operation-type/top` | `{ operationType: string\|null; count: string } \| undefined` |
| `GET /stats/operation-type/least` | `{ operationType: string\|null; count: string } \| undefined` |
| `GET /stats/zones` | `{ zone: string\|null; count: string; percentage: string }[]` |
| `GET /stats/cities` | `{ localidad: string\|null; count: string; percentage: string }[]` — campo **`localidad`**, no `city` |
| `GET /stats/price/average` | `{ averagePrice: string\|null }` |
| `GET /stats/price/ranges` | `{ range: string; count: string }[]` — `range` ∈ `"Menos de 80k"`, `"80k - 120k"`, `"120k - 200k"`, `"Más de 200k"` |
| `GET /stats/price/by-property-type` | `{ propertyType: string\|null; avgPrice: string }[]` |
| `GET /stats/price/by-zone` | `{ zone: string\|null; avgPrice: string }[]` |
| `GET /stats/price/min` | `{ lowestPrice: string\|null }` |
| `GET /stats/price/max` | `{ highestPrice: string\|null }` |
| `GET /stats/rooms/average` | `{ avgRooms: string\|null }` |
| `GET /stats/bathrooms/average` | `{ avgBathrooms: string\|null }` |
| `GET /stats/rooms/distribution` | `{ rooms: number\|null; count: string; percentage: string }[]` |
| `GET /stats/extras` | `[{ garagecount: string; garagepercentage: string; patiocount: string; patiopercentage: string }]` — **claves en minúscula** (Postgres pliega identificadores sin comillas). Sin datos: `[{ garagecount: 0, garagepercentage: 0, patiocount: 0, patiopercentage: 0 }]` (números) |
| `GET /stats/extras/patio` | ⚠️ Idéntico a `/stats/extras` — llama al mismo método (`extrasUsage()`) |
| `GET /stats/extras/garage` | ⚠️ Idéntico a `/stats/extras` — mismo método |
| `GET /stats/antiquity/average` | `{ avgAntiquity: string\|null }` |
| `GET /stats/antiquity/new-construction` | `{ count: string; percentage: string }`, o `{ count: 0, percentage: 0 }` sin datos |

---

## 17. Módulo `posts` — publicaciones

Feed estilo red social. A diferencia de `Property`, **no** tiene campos estructurados (precio, ambientes, ubicación): esos datos van "quemados" dentro de la imagen, que el admin arma por fuera y sube ya editada.

**Las publicaciones son efímeras:** un cron (`@Cron(EVERY_DAY_AT_3AM)`) borra las de más de **7 días** (`POST_TTL_DAYS`), junto con sus likes, comentarios e imagen de Cloudinary.

Guards de clase: `JwtAuthGuard` + `RolesGuard`.

| Método | Ruta | Auth |
|---|---|---|
| GET | `/posts` | Público (+ `OptionalJwtAuthGuard`) |
| GET | `/posts/:id` | Público (+ `OptionalJwtAuthGuard`) |
| POST | `/posts` | **ADMIN** |
| DELETE | `/posts/:id` | **ADMIN** |
| POST | `/posts/:id/like` | JWT (cualquier rol) |
| GET | `/posts/:id/comments` | **Público (+ `OptionalJwtAuthGuard`)** ⚠️ agregado |
| POST | `/posts/:id/comments` | JWT |
| POST | `/posts/comments/:commentId/reply` | JWT (cualquier rol) |
| PATCH | `/posts/comments/:commentId/hide` | **ADMIN** |
| DELETE | `/posts/comments/:commentId` | **ADMIN** |

### Entidades

```ts
/** Del autor SOLO se exponen estos campos — nunca el resto del User. */
type PostAuthor = { id: number; name: string; surname: string|null; photo: string|null; role: Role };

interface Post {
  id: number;
  description: string;
  imageUrl: string;
  imagePublicId: string;
  likesCount: number;         // contador desnormalizado, para ordenar sin subquery
  createdAt: string;
  agent: PostAuthor;
  commentsCount?: number;     // solo en GET /posts — cuenta SOLO los visibles
  likedByMe: boolean;         // siempre presente en GET /posts y GET /posts/:id
}

interface PostComment {
  id: number;
  content: string;
  isHidden: boolean;
  createdAt: string;
  postId: number;
  userId: number;
  parentCommentId: number | null;   // null = comentario raíz
  user: PostAuthor;
  replies?: PostComment[];          // solo en el listado de comentarios
}
```

### GET /posts
Query: `?sortBy=recent|oldest|mostLiked` (default `recent`).
Response **200**: `Post[]` con `commentsCount` y `likedByMe`. Para un visitante anónimo, `likedByMe` es siempre `false`.

### GET /posts/:id
Response **200**: `Post & { likedByMe: boolean }` (sin `commentsCount`). Error **404** `"No existe la publicación con ID {id}"`.

### POST /posts (ADMIN)
`multipart/form-data`: **`data`** = JSON `{ description: string }` (`@IsNotEmpty @MaxLength(1000)`), **`image`** = un archivo (`image/*`, ≤5 MB).
Response **201**: el `Post` creado (vía `findOne`).
Errores: **400** `"La publicación necesita una imagen"` · **502** `"No pudimos procesar la imagen. Intentá de nuevo."` (si falla el guardado después de subir, la imagen se borra en rollback) · §1.b / §1.c / §1.e.
**Efecto lateral:** notifica a todos los usuarios (`type: nueva_publicacion`, in-app + email, respetando `notifyBroadcast`).

### DELETE /posts/:id (ADMIN)
Response **200**: `{ "message": "Publicación {id} eliminada correctamente" }`. Error **404** `"La publicación no existe"`.

### POST /posts/:id/like
**Toggle** — la misma llamada da y quita el like. Transaccional; el contador se actualiza en SQL (`likesCount + 1` / `GREATEST(likesCount - 1, 0)`) para ser seguro bajo concurrencia.
Response **201**: `{ liked: boolean; likesCount: number }`. Error **404** `"La publicación no existe"`.

### GET /posts/:id/comments

⚠️ **Dos cambios respecto de la versión anterior de este documento:**

1. **Ahora lleva `OptionalJwtAuthGuard`.** Antes esta ruta era `@Public()` sin ese guard adicional, así que `req.user` quedaba **vacío incluso para el admin logueado** — `role === Role.ADMIN` era siempre `false` y el admin no podía ver (ni revertir) los comentarios que él mismo había ocultado. Corregido: ahora el admin sí recibe `isHidden: true` correctamente.
2. **Bug corregido: ocultar la única respuesta de un comentario ya no borra el comentario padre.** Antes, si un comentario raíz tenía respuestas y todas quedaban ocultas, el filtro (mal puesto en el `WHERE` del LEFT JOIN) descartaba la fila entera y el comentario raíz —visible y legítimo— desaparecía del listado público. Ahora el filtro está en el `ON` del join: las respuestas ocultas simplemente no se adjuntan (`replies: []`), y el comentario raíz se sigue mostrando.

Devuelve los comentarios **raíz** con sus `replies` anidadas — como máximo dos niveles: responder una respuesta la cuelga del mismo raíz.
Orden: raíces por `createdAt DESC`, respuestas por `createdAt ASC`.
**Solo el ADMIN ve los `isHidden: true`** (tanto raíces como respuestas).

### POST /posts/:id/comments
Body: `{ content: string }` (`@IsNotEmpty @MaxLength(500)`). Response **201**: el `PostComment` con su `user`. Notifica al admin (`type: admin_comentario_publicacion`) salvo que comente el propio admin.

### POST /posts/comments/:commentId/reply
Abierto a **cualquier usuario logueado**, no solo al admin — la conversación funciona como en una red social; el frontend distingue visualmente las respuestas del admin por `user.role`.
Body: `{ content: string }` (`@MaxLength(500)`).
Response **201**: el `PostComment` creado, con `parentCommentId` apuntando al **raíz**. Error **404** `"El comentario no existe"`.
Notifica al autor del comentario respondido (`type: respuesta_comentario`, salvo autorespuesta).

### PATCH /posts/comments/:commentId/hide (ADMIN)
Toggle. Response **200**: `{ id, isHidden, message: "Comentario ocultado" | "Comentario visible de nuevo" }`.

### DELETE /posts/comments/:commentId (ADMIN)
Response **200**: `{ "message": "Comentario eliminado correctamente" }`. El CASCADE borra también sus respuestas.

---

## 18. Módulo `tracking` — telemetría

Dos endpoints públicos que el frontend llama por su cuenta, más dos registros **automáticos** que se disparan como efecto lateral de endpoints de propiedades.

`VisitorIdMiddleware` se aplica a **todas** las rutas (`forRoutes('*')`) y garantiza la cookie `ct_vid` (§0).

| Método | Ruta | Auth | Throttle |
|---|---|---|---|
| POST | `/tracking/visit` | Público (+ `OptionalJwtAuthGuard`) | 120/min |
| POST | `/tracking/duration` | Público (+ `OptionalJwtAuthGuard`) | 120/min |

### POST /tracking/visit
Body: `{ path: string }` (`@IsNotEmpty @MaxLength(300)`, ej. `"/properties/4"`).
Response **201**: `{ visitId: number | null }` — **`null` si el registro falló**. Nunca lanza error: una métrica no puede romper la navegación.
Guarda `visitorId`, `path`, `userId` (o `null`) e `isAdmin`.

### POST /tracking/duration
Body: `{ visitId: number; durationMs: number }` (ambos `@IsInt @Min(1)`).
Pensado para llamarse con `navigator.sendBeacon` al ocultarse la pestaña.
Response **201**: `{ ok: true }` — **siempre**, incluso si el `visitId` no existe o pertenece a otro visitante (solo actualiza cuando el `visitorId` coincide).

### Registros automáticos (sin endpoint propio)

| Origen | Tabla | Se omite si… |
|---|---|---|
| `GET /properties/:id` | `property_views` | el visitante es ADMIN |
| `GET /properties/filter` | `filter_usages` | el visitante es ADMIN, o la búsqueda no tenía ningún filtro real |

De `filter_usages` se excluyen `page`, `limit`, `sortBy`, `order` y `status`: son controles de la grilla, no intención de búsqueda. Los booleanos se guardan solo cuando el usuario los **activó** (`"true"`); `"false"` se guarda como `undefined`.

---

## 19. Módulo `statistics` — panel de administración

Distinto del módulo `stats` (§16): aquél mide el formulario de feedback manual, éste mide **el comportamiento real**, cruzando `filter_usages` + `search_preferences` + `page_visits` + `property_views` + las tablas de dominio.

**Todo el módulo es JWT + ADMIN** (guards y `@Roles` a nivel de clase, para que ninguna ruta nueva quede abierta por olvido).
Todos los endpoints aceptan **`?range=day|week|month`** (default `month`); un valor inválido → 400 (§1.b).

**Todos los valores numéricos ya vienen convertidos a `number`** — a diferencia de `/stats`.

| Ruta | Qué devuelve |
|---|---|
| `GET /statistics` | Las 11 secciones juntas (evita 11 llamadas al abrir el panel) |
| `GET /statistics/searched-features` | Zonas, localidades, barrios, provincias, tipos, ambientes, rangos de precio, extras y promedios más buscados |
| `GET /statistics/operation-type` | Torta venta / alquiler / temporal |
| `GET /statistics/most-favorited` | Top 8 propiedades más agregadas a favoritos |
| `GET /statistics/most-commented` | Top 8 más comentadas |
| `GET /statistics/best-rated` | Top 8 mejor valoradas (mínimo 2 valoraciones) |
| `GET /statistics/most-viewed` | Top 8 más visitadas + visitantes únicos |
| `GET /statistics/traffic` | Visitas totales, únicos, logueados vs anónimos, serie por día, páginas top |
| `GET /statistics/registrations` | Altas por método (formulario / Google) |
| `GET /statistics/property-requests` | Solicitudes por estado |
| `GET /statistics/average-time` | Tiempo promedio en página, global y por ruta |
| `GET /statistics/own-inventory` | Qué hay cargado en el catálogo (no usa tracking) |

### Tipos base

```ts
interface StatRow { label: string; count: number; percentage: number }

interface PropertyRankRow {
  propertyId: number;
  title: string;               // "Propiedad #N" si la propiedad ya no existe
  imageUrl: string | null;     // portada, o la primera imagen
  localidad: string;
  count: number;
  average?: number;            // solo en best-rated
}
```

### Shapes por endpoint

```ts
// GET /statistics/searched-features
{
  range: StatsRange;
  zonas: StatRow[]; localidades: StatRow[]; barrios: StatRow[]; provincias: StatRow[];
  tiposDePropiedad: StatRow[];      // resuelve el id a nombre real
  habitaciones: StatRow[]; banios: StatRow[];
  rangosDePrecio: StatRow[];
  extras: StatRow[];
  promedios: { antiguedadMaxima: number; supTotal: number; precio: number };
  totalBusquedas: number;   // 0 → mostrar "todavía no hay datos", no un gráfico vacío
}

// GET /statistics/operation-type
{ range: StatsRange; data: StatRow[] }

// GET /statistics/most-favorited
{ range: StatsRange; rangeApplies: false; data: PropertyRankRow[] }
// ⚠️ rangeApplies: false — `Favorite` NO tiene fecha, el ranking es HISTÓRICO
//    aunque se mande ?range=day. El frontend debe aclararlo en pantalla.

// GET /statistics/most-commented
{ range: StatsRange; rangeApplies: true; data: PropertyRankRow[] }

// GET /statistics/best-rated
{ range: StatsRange; rangeApplies: false; minRatings: 2; data: PropertyRankRow[] }
// ⚠️ `Rating` tampoco guarda fecha → histórico. Exige ≥2 valoraciones para no
//    rankear primero a una propiedad con un único 5 estrellas.

// GET /statistics/most-viewed
{ range: StatsRange; rangeApplies: true;
  data: (PropertyRankRow & { uniqueVisitors: number })[] }
// 50 vistas de 3 personas no es lo mismo que 50 vistas de 50 personas.

// GET /statistics/traffic
{
  range: StatsRange;
  totalVisitas: number;
  visitantesUnicos: number;
  visitantesLogueados: number;
  visitantesAnonimos: number;
  porDia: { dia: string; visitas: number; unicos: number }[];
  paginasMasVistas: StatRow[];
}

// GET /statistics/registrations
{ range: StatsRange; total: number; porMetodo: StatRow[] }
// label ∈ "Formulario del sitio" | "Google"

// GET /statistics/property-requests
{ range: StatsRange; total: number; porEstado: StatRow[] }
// label ∈ "Enviadas" | "En revisión" | "Aceptadas" | "Rechazadas"

// GET /statistics/average-time
{
  range: StatsRange;
  promedioSegundos: number;
  muestras: number;
  porPagina: { label: string; segundos: number; muestras: number }[];
}
// Solo cuenta visitas CERRADAS (con durationMs informado) y excluye al admin.

// GET /statistics/own-inventory
{
  range: StatsRange;
  totalEnRango: number;      // propiedades CARGADAS dentro del rango (created_at)
  totalHistorico: number;    // todas
  porTipo: StatRow[]; porOperacion: StatRow[];
  porZona: StatRow[]; porLocalidad: StatRow[]; porBarrio: StatRow[];
}

// GET /statistics  (overview)
{
  range: StatsRange;
  generadoEn: string;        // ISO
  busquedas: /* searched-features */;   operacion: /* operation-type */;
  favoritas: /* most-favorited */;      comentadas: /* most-commented */;
  valoradas: /* best-rated */;          visitadas: /* most-viewed */;
  trafico:   /* traffic */;             registros: /* registrations */;
  solicitudes: /* property-requests */; tiempo: /* average-time */;
  inventario: /* own-inventory */;
}
```

⚠️ **Nota de rendimiento (no cambia el contrato):** `searched-features` recorre `filter_usages`/`search_preferences` con `find()` y agrega en JavaScript, en vez de un `GROUP BY` en SQL — funciona bien con el volumen actual, pero es lo primero a rehacer si esas tablas crecen mucho.

---

## 20. Guards y roles — referencia rápida

| Guard / decorador | Efecto |
|---|---|
| **`@Public()`** | La ruta no exige JWT. `JwtAuthGuard` cortocircuita con `return true` **sin ejecutar passport** → `req.user` queda **vacío aunque el visitante esté logueado**. |
| **`OptionalJwtAuthGuard`** | Se **suma** al guard de clase (no lo reemplaza). Puebla `req.user` si hay token válido y **nunca rechaza** si no lo hay. Necesario en toda ruta `@Public()` que tenga que distinguir admin/usuario/anónimo: `GET /posts`, `GET /posts/:id`, `GET /posts/:id/comments` (agregado), `GET /properties/filter`, `GET /properties/:id`, `GET /properties/:propertyId/comments`. |
| **Sin ningún `@UseGuards`** | `POST /users`, `POST /feedback/search`, `GET /feedback/search/check/:deviceId` y `GET /ratings/:propertyId` son totalmente públicos. |
| **JWT sin rol** | Cualquier usuario autenticado (`user` o `admin`). |
| **`@Roles(Role.ADMIN)` + `RolesGuard`** | Exige `role: "admin"`; si no → **403** `"No tienes permisos para acceder a este recurso"` (o el mensaje propio del controller, ej. `"No tienes permiso para actualizar este usuario"`). |
| **`@Roles(Role.USER)` + `RolesGuard`** ⚠️ **corregido** | Exige `role: "user"` **de verdad** — un admin recibe **403**. Aplica hoy a `favorites` (§8, las 4 rutas), `POST /ratings/:propertyId` (§9) y `POST /search-preferences` (§12). Antes de la corrección del 2026-08-03/04, estos `@Roles(Role.USER)` eran decorativos (faltaba `RolesGuard`) y un admin también podía usarlos. **Confirmado como comportamiento correcto**, no se revierte. |

**`req.user`** tiene siempre exactamente esta forma, en todo endpoint con JWT — nunca más campos (sale de `JwtStrategy.validate()`, que consulta la DB en cada request):

```ts
{ id: number; email: string; role: 'user' | 'admin' }
```

**Revocación de sesión (401 `"Sesión inválida"`):** `JwtStrategy` valida en **cada request** que (a) el usuario siga existiendo en la DB y (b) el `tokenVersion` del payload coincida con el de la DB. `POST /auth/logout` y todo cambio de password incrementan `tokenVersion` → los tokens viejos dejan de servir al instante, aunque no hayan expirado. El `role` también sale **siempre de la DB**, no del payload: un cambio de rol tiene efecto inmediato.

---

## 21. Tipos TypeScript sugeridos (listos para copiar al frontend)

```ts
// ════════════════════════════════════════════════════════════
// ENUMS
// ════════════════════════════════════════════════════════════

export enum Role { USER = 'user', ADMIN = 'admin' }

export enum AuthProvider { LOCAL = 'local', GOOGLE = 'google' }

export enum StatusProperty {
  DISPONIBLE = 'disponible',
  PENDIENTE  = 'pendiente',
  VENDIDO    = 'vendida',
  ALQUILADA  = 'alquilada',
  ELIMINADO  = 'eliminado',
  PAUSADO    = 'en pausa',
}

export enum OperationType {
  VENTA             = 'venta',
  ALQUILER          = 'alquiler',
  ALQUILER_TEMPORAL = 'temporal',
}

/** Moneda de `Property.price`. NO aplica a `expensas` (siempre ARS). */
export enum Currency {
  ARS = 'ARS',
  USD = 'USD',
}

export enum PropertySortBy {
  PRICE = 'price', ANTIQUITY = 'antiquity', DATE = 'date', RATING = 'rating',
}

export enum RequestStatus {
  ENVIADO = 'enviado', REVISION = 'en_revision',
  ACEPTADO = 'aceptado', RECHAZADO = 'rechazado',
}

/** Transiciones aceptadas por PATCH /property-requests/:id/status. */
export const VALID_REQUEST_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  [RequestStatus.ENVIADO]:   [RequestStatus.REVISION, RequestStatus.ACEPTADO, RequestStatus.RECHAZADO],
  [RequestStatus.REVISION]:  [RequestStatus.ACEPTADO, RequestStatus.RECHAZADO],
  [RequestStatus.ACEPTADO]:  [],
  [RequestStatus.RECHAZADO]: [RequestStatus.REVISION],
};

export enum TipoPropiedadRequest {
  CASA = 'Casa', DEPARTAMENTO = 'Departamento', TERRENO = 'Terreno',
  LOCAL = 'Local', OFICINA = 'Oficina', QUINTA = 'Quinta',
}
export enum TipoOperacionRequest {
  VENTA = 'Venta', ALQUILER = 'Alquiler', ALQUILER_TEMPORAL = 'Alquiler temporal',
}
export enum EstadoConservacionRequest {
  EXCELENTE = 'Excelente', MUY_BUENO = 'Muy bueno', BUENO = 'Bueno',
  REGULAR = 'Regular', A_REFACCIONAR = 'A refaccionar',
}

export enum PostSortBy { RECENT = 'recent', OLDEST = 'oldest', MOST_LIKED = 'mostLiked' }

export enum StatsRange { DAY = 'day', WEEK = 'week', MONTH = 'month' }

/** Enums del feedback anónimo — DISTINTOS de los de arriba. */
export enum FeedbackOperationType { ALQUILER = 'alquiler', VENTA = 'venta' }
export enum FeedbackPropertyType {
  CASA = 'casa', DEPARTAMENTO = 'departamento', TERRENO = 'terreno',
  LOCAL = 'local', OFICINA = 'oficina',
}

export type NotificationTargetRole = 'user' | 'admin';

/** ⚠️ NUEVO. `targetRole` decide el feed; `type` decide ícono/color/navegación. */
export enum NotificationType {
  PROPIEDAD_MATCH       = 'propiedad_match',
  NUEVA_PROPIEDAD       = 'nueva_propiedad',
  CAMBIO_PRECIO         = 'cambio_precio',
  NUEVA_PUBLICACION     = 'nueva_publicacion',
  RESPUESTA_COMENTARIO  = 'respuesta_comentario',
  ESTADO_SOLICITUD      = 'estado_solicitud',
  ADMIN_NUEVO_USUARIO          = 'admin_nuevo_usuario',
  ADMIN_NUEVO_COMENTARIO       = 'admin_nuevo_comentario',
  ADMIN_NUEVA_VALORACION       = 'admin_nueva_valoracion',
  ADMIN_NUEVA_SOLICITUD        = 'admin_nueva_solicitud',
  ADMIN_NUEVO_FAVORITO         = 'admin_nuevo_favorito',
  ADMIN_COMENTARIO_PUBLICACION = 'admin_comentario_publicacion',
  GENERICA = 'generica',
}

// ════════════════════════════════════════════════════════════
// ENTIDADES
// ════════════════════════════════════════════════════════════

export interface User {
  id: number;
  name: string;
  surname: string | null;
  phone: string | null;
  photo: string | null;
  email: string;
  profileIncomplete: boolean;
  role: Role;
  authProvider: AuthProvider;
  notifyBroadcast: boolean;
  tokenVersion: number;
  createdAt: string;
  updatedAt: string;
  // password: nunca presente en ninguna respuesta.
}

/** Proyección pública del agente/referredBy en respuestas de Property — NUNCA el User completo (sin email, sin tokenVersion). */
export interface PublicAgent {
  id: number;
  name: string;
  surname: string | null;
  phone: string | null;
  photo: string | null;
}

export interface PropertyType { id: number; name: string }

export interface PropertyImage {
  id: number;
  url: string;
  hash: string | null;
  isCover: boolean;
  order: number;         // 0 = primera. INVARIANTE: order === 0 ⇔ isCover
  publicId: string;
  property?: Property;   // aparece en /property-images/*, ver §0
}

export interface ReorderImagesDto {
  /** Ids en el orden deseado. TODAS las imágenes de la propiedad, sin repetir. */
  imageIds: number[];
}

export interface Property {
  id: number;
  title: string;
  description: string;
  provincia: string;
  localidad: string;
  barrio: string;
  direccion: string | null;
  zone: string;
  rooms: number;
  bathrooms: number;
  property_deed: boolean;
  tractoAbreviado: boolean;
  boleto: boolean;
  garage: boolean;
  patio: boolean;
  aptoMascotas: boolean;             // NOT NULL, default false
  supTotal: number | null;
  supCubierta: number | null;
  antiquity: number;
  price: number;
  /** Expensas mensuales EN PESOS (no siguen a `currency`). null = no informadas. */
  expensas: number | null;
  currency: Currency;                // NOT NULL, default 'USD' — nunca llega null
  status: StatusProperty;
  operationType: OperationType;
  created_at: string;
  updated_at: string;
  typeOfProperty: PropertyType;      // eager: SIEMPRE presente
  images?: PropertyImage[];
  agent?: PublicAgent;
  ratingAverage: number;             // GET /properties, /properties/filter y /properties/:id
  /** Solo en GET /properties/:id. */
  comments?: Comment[];              // incluye TODOS, también isHidden: true
  ratings?: Rating[];
  favoritesCount?: number;
  referredBy?: PublicAgent | null;
}

export interface Favorite {
  user_id: number;
  property_id: number;
  user?: User;
  property?: Property;
}

export interface Rating {
  id: number;
  score: number;
  userId: number;
  propertyId: number;
  user?: Pick<User, 'id' | 'name' | 'photo'>;
  property?: Property;
}

export interface Comment {
  id: number;
  message: string;
  isHidden: boolean;
  created_at: string;
  userId: number;
  propertyId: number;
  user?: Pick<User, 'id' | 'name' | 'surname' | 'photo'>;
  property?: Property;
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  propertyId: number | null;
  read: boolean;
  targetRole: NotificationTargetRole;
  type: NotificationType;
  relatedUserId: number | null;
  createdAt: string;
}

export interface SearchPreference {
  id: number;
  user?: User;
  zone: string | null;
  localidad: string | null;
  barrio: string | null;
  operationType: OperationType | null;
  typeOfProperty: PropertyType | null;
  property_deed: boolean | null;
  tractoAbreviado: boolean | null;
  boleto: boolean | null;
  preferredPrice: number | null;
  minRooms: number | null;
  minBathrooms: number | null;
  supTotal: number | null;
  supCubierta: number | null;
  garage: boolean | null;
  patio: boolean | null;
  maxAntiquity: number | null;
  notifyNewMatches: boolean;
  notifyPriceDrops: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyRequest {
  id: number;
  localidad: string;
  barrio: string;
  direccion: string;
  pisoDepto: string | null;
  tipoPropiedad: string;
  tipoOperacion: string;
  estadoConservacion: string;
  m2Totales: number;
  m2Cubiertos: number;
  habitaciones: number;
  baños: number;
  patio: boolean;
  garage: boolean;
  antiguedad: number;
  orientacion: string | null;
  escritura: boolean;
  impuestosAlDia: boolean;
  aptoCredito: boolean;
  /** ⚠️ columna decimal(12,2) → llega como STRING desde Postgres. */
  precioEstimado: string;
  mensajeAgente: string | null;
  status: RequestStatus;
  userId: number;
  user?: User;
  createdAt: string;
}

/** Autor tal como lo expone el módulo posts — nunca el User completo. */
export type PostAuthor = Pick<User, 'id' | 'name' | 'surname' | 'photo' | 'role'>;

export interface Post {
  id: number;
  description: string;
  imageUrl: string;
  imagePublicId: string;
  likesCount: number;
  createdAt: string;
  agent: PostAuthor;
  /** Solo en GET /posts. Cuenta únicamente los comentarios visibles. */
  commentsCount?: number;
  likedByMe: boolean;
}

export interface PostComment {
  id: number;
  content: string;
  isHidden: boolean;
  createdAt: string;
  postId: number;
  userId: number;
  parentCommentId: number | null;
  user: PostAuthor;
  replies?: PostComment[];
}

export interface UserSearchFeedback {
  id: number;
  rooms: number | null;
  bathrooms: number | null;
  zone: string | null;
  localidad: string | null;
  barrio: string | null;
  /** ⚠️ columnas decimal → strings. */
  priceMin: string | null;
  priceMax: string | null;
  propertyType: FeedbackPropertyType | null;
  operationType: FeedbackOperationType | null;
  antiquityMax: number | null;
  hasGarage: boolean | null;
  hasPatio: boolean | null;
  notes: string | null;
  deviceId: string;
  createdAt: string;
}

// ════════════════════════════════════════════════════════════
// DTOs DE ENTRADA
// ════════════════════════════════════════════════════════════

export interface RegisterDto {
  name: string; surname: string; phone: string;
  photo?: string; email: string; password: string;
}

export interface LoginDto { email: string; password: string }

export interface GoogleLoginDto { idToken: string }

export interface UpdateUserDto {
  name?: string; surname?: string; phone?: string; photo?: string;
  email?: string; password?: string; notifyBroadcast?: boolean;
}

/** GET /properties (listado simple, sin filtros) — NO reusar PropertyFilterDto acá. */
export interface PropertyPaginationDto {
  page?: number;
  limit?: number;
}

export interface PropertyFilterDto {
  sortBy?: PropertySortBy;
  order?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
  // ⚠️ `title` NO existe — eliminado del DTO. Usar `search`.
  zone?: string;
  provincia?: string; localidad?: string; barrio?: string; direccion?: string;
  search?: string;
  rooms?: number; bathrooms?: number; typeOfPropertyId?: number;
  minPrice?: number; maxPrice?: number;
  minSupTotal?: number; maxSupTotal?: number;
  minSupCubierta?: number; maxSupCubierta?: number;
  /** ⚠️ `maxExpensas` INCLUYE las propiedades sin expensas; `minExpensas` las excluye. */
  minExpensas?: number; maxExpensas?: number;
  maxAntiquity?: number;
  /** ⚠️ strings, no booleanos: son query params. */
  garage?: 'true' | 'false';
  patio?: 'true' | 'false';
  property_deed?: 'true' | 'false';
  tractoAbreviado?: 'true' | 'false';
  boleto?: 'true' | 'false';
  status?: StatusProperty;
  operationType?: OperationType;
}

export interface CreatePropertyDto {
  title: string; description: string;
  typeOfPropertyId: number;
  operationType: OperationType;
  property_deed: boolean; tractoAbreviado: boolean; boleto: boolean;
  provincia: string; localidad: string; barrio: string; direccion: string; zone: string;
  rooms: number; bathrooms: number;
  garage: boolean; patio: boolean;
  aptoMascotas?: boolean;       // opcional — sin valor queda en false
  supTotal: number; supCubierta: number;
  antiquity: number; price: number;
  expensas?: number;            // opcional, entero ≥ 0, EN PESOS
  currency?: Currency;          // opcional — el DTO la deja en 'USD' si falta
  status: StatusProperty;
}

export type UpdatePropertyDto = Partial<CreatePropertyDto> & {
  deleteImages?: number[];
  setCoverImageId?: number;
  /** `null` BORRA las expensas guardadas; omitir el campo las deja como estaban. */
  expensas?: number | null;
};

export interface CreateSearchPreferenceDto {
  zone?: string; localidad?: string; barrio?: string;
  operationType?: OperationType;
  typeOfPropertyId?: number;
  garage?: boolean; patio?: boolean;
  property_deed?: boolean; tractoAbreviado?: boolean; boleto?: boolean;
  preferredPrice?: number;
  minRooms?: number; minBathrooms?: number;
  supTotal?: number; supCubierta?: number;
  maxAntiquity?: number;
  notifyNewMatches?: boolean; notifyPriceDrops?: boolean;
}

export interface CreateRequestPropertyDto {
  localidad: string; barrio: string; direccion: string;
  pisoDepto?: string;
  tipoPropiedad: TipoPropiedadRequest;
  tipoOperacion: TipoOperacionRequest;
  estadoConservacion: EstadoConservacionRequest;
  m2Totales: number; m2Cubiertos: number;
  habitaciones: number; baños: number;
  antiguedad: number;
  orientacion?: string;
  patio: boolean; garage: boolean;
  escritura: boolean; impuestosAlDia: boolean; aptoCredito: boolean;
  precioEstimado: number;
  mensajeAgente?: string;
}

export interface CreateUserSearchFeedbackDto {
  rooms?: number; bathrooms?: number;
  zone?: string; localidad?: string; barrio?: string;
  priceMin?: number; priceMax?: number;
  propertyType?: FeedbackPropertyType;
  operationType?: FeedbackOperationType;
  antiquityMax?: number;
  hasGarage?: boolean; hasPatio?: boolean;
  notes?: string;
  deviceId: string;   // UUID v4, obligatorio
}

export interface CreatePostDto { description: string }          // @MaxLength(1000)
export interface CreatePostCommentDto { content: string }        // @MaxLength(500)
export interface RecordVisitDto { path: string }                 // @MaxLength(300)
export interface RecordDurationDto { visitId: number; durationMs: number }

// ════════════════════════════════════════════════════════════
// RESPUESTAS
// ════════════════════════════════════════════════════════════

/** GET /properties Y GET /properties/filter — mismo shape desde la corrección de contrato. */
export interface PaginatedProperties {
  data: Property[];
  meta: {
    totalItems: number;
    itemCount: number;
    totalPages: number;
    currentPage: number;
  };
}

export interface LocationFilters {
  localidades: string[];
  barrios: string[];
  zones: string[];
}

export interface AuthResponse { message: string; user: User }

export interface StatRow { label: string; count: number; percentage: number }

export interface PropertyRankRow {
  propertyId: number;
  title: string;
  imageUrl: string | null;
  localidad: string;
  count: number;
  average?: number;
}

export interface ToggleLikeResponse { liked: boolean; likesCount: number }

export interface UnreadCountResponse { count: number }

// ════════════════════════════════════════════════════════════
// ERRORES
// ════════════════════════════════════════════════════════════

/** Excepciones HTTP estándar (§1.a). */
export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error: string;
}

/** Fallo de class-validator o JsonToDtoPipe (§1.b). */
export interface ApiValidationErrorResponse {
  statusCode: 400;
  message: string[];
  error: 'Bad Request';
}

/** Rate limit (§1.d) — SIN campo `error`. */
export interface ApiThrottleErrorResponse {
  statusCode: 429;
  message: string;
}

export type ApiError =
  | ApiErrorResponse
  | ApiValidationErrorResponse
  | ApiThrottleErrorResponse;

/** Discrimina el shape 1.b del 1.a: `message` array vs string. */
export function isValidationError(e: ApiError): e is ApiValidationErrorResponse {
  return Array.isArray((e as ApiValidationErrorResponse).message);
}
```

---

## 22. Rutas que dependen del orden de declaración

Nest matchea en orden de declaración. Estas rutas específicas están declaradas **antes** de un patrón `:param` que se las comería; moverlas rompe la API:

| Ruta específica | Patrón que la comería si fuera después |
|---|---|
| `PATCH /users/me` | `PATCH /users/:id` |
| `DELETE /favorites/all` | `DELETE /favorites/:propertyId` |
| `GET /ratings/mine` | `GET /ratings/:propertyId` (además `ParseIntPipe` daría 400 con `"mine"`) |
| `GET /properties/filter` | `GET /properties/:id` |
| `GET /notifications/unread-count` | (no hay `GET /notifications/:id`, pero se declara primero por convención) |

Las rutas de dos o más segmentos (`/properties/filters/locations`, `/property-requests/my-requests/:id`, `/posts/comments/:commentId/reply`, `/notifications/admin/read-all`) **no** colisionan con los patrones de un solo segmento, sin importar el orden en que estén declaradas.

---

## 23. Variables de entorno

| Variable | Obligatoria | Efecto si falta |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` | sí | No conecta a la DB |
| `JWT_SECRET` | **sí** | **Aborta el arranque** |
| `JWT_EXPIRATION_TIME` | no | Default 24 h para el `maxAge` de la cookie |
| `GOOGLE_CLIENT_ID` | **sí** | **Aborta el arranque** |
| `EMAIL_FROM` | **sí** | **Aborta el arranque** |
| `SENDGRID_API_KEY` | condicional | Transporte de email por defecto (si `SMTP_HOST` no está definida) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | no | Definir `SMTP_HOST` cambia el transporte a SMTP |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | no | Sin ellas no se crea el admin (solo un warning). ⚠️ `ADMIN_PASSWORD` de menos de 12 caracteres **aborta el arranque** (solo si el admin todavía no existe) |
| `ADMIN_NAME`, `ADMIN_SURNAME`, `ADMIN_PHONE` | no | Campos del admin por defecto |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | sí (para imágenes) | Toda subida responde 502 |
| `FRONTEND_URL` | no | Fallback CORS a `http://localhost:3001` — en producción es obligatoria en la práctica |
| `PORT` | no | Default 3000 |
| `NODE_ENV` | no | `production` desactiva `synchronize` y activa `secure` en las cookies — en producción es obligatoria en la práctica |

---

## 24. Migraciones — estado actual

```
src/migrations/
  1785731109084-InitialSchema.ts                    ← baseline: crea las 18 tablas desde cero
  1785731953058-AddNotificationType.ts               ← Notification.type + backfill de filas existentes
  1785732291219-AddForeignKeyIndexes.ts              ← índices de rendimiento (no cambia ningún contrato)
  1785732860217-UniqueSearchPreferencePerUser.ts     ← constraint única + salvaguarda de auditoría
  1786190400000-AddPropertyCurrency.ts               ← Property.currency (enum ARS|USD, default USD). Sin backfill.
  1786190500000-AddPropertyImageOrder.ts             ← PropertyImages.order + BACKFILL (numera cada galería 0..n-1)
  1786190600000-AddPropertyExpensasAndPets.ts        ← Property.expensas (int null) y Property.aptoMascotas (bool false). Sin backfill.

src/migrations/_archivo_pre_baseline/    ← NO se ejecutan (fuera del glob de TypeORM). Solo referencia histórica.
  1785186415891-AddPropertySurfaceAndLegalFields.ts
  1785206449494-AddPostsFeature.ts
  1785265872874-AddIsHiddenToComments.ts
  1785269135372-AddTrackingInfrastructure.ts
```

Verificado (2026-08-03) contra una base Postgres vacía real: `migration:run` termina sin error y el schema resultante coincide exactamente con el que generaba `synchronize` en desarrollo — mismas columnas, mismos índices.

⚠️ **Las tres migraciones del 2026-08-08 (`AddPropertyCurrency`, `AddPropertyImageOrder`, `AddPropertyExpensasAndPets`) todavía NO se corrieron contra una base real.** Fueron escritas a mano (no generadas por el CLI) y compilan, pero la verificación de arriba no las cubre. Antes de producción hay que correr `npm run migration:run` sobre una copia de la base y revisar especialmente el backfill de `AddPropertyImageOrder`, que es la única de las tres que **modifica datos existentes**.

`UniqueSearchPreferencePerUser` hace un `DELETE` de filas duplicadas antes de crear el índice único; antes de borrar, loguea por consola qué va a borrar y copia esas filas a `_migration_backup_search_preferences_dupes` (tabla que la migración nunca borra) para poder auditar en producción.
