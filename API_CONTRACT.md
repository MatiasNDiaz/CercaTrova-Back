# API_CONTRACT.md — Contrato técnico exacto de CercaTrova-Back

> Generado por lectura directa del código fuente (controllers, services, DTOs, entidades, guards) y verificado contra el código fuente de `@nestjs/common`/`@nestjs/throttler` en `node_modules` para confirmar el shape exacto de las excepciones. Documento de solo lectura — no describe intención ni seguridad, solo la forma real de la API tal como responde HOY.

---

## 0. Notas globales (leer antes que todo lo demás)

- **Base URL:** `http://localhost:<PORT>` (`PORT` en `.env`, default `3000` si no está seteado). Sin prefijo global (no hay `app.setGlobalPrefix`).
- **Body parser:** JSON estándar de Express/Nest. Un JSON malformado en el body devuelve 400 con HTML/texto plano de Express (no el shape JSON de abajo) — caso de borde, no debería ocurrir con `fetch`/`axios` usando `JSON.stringify`.
- **ValidationPipe global** (`main.ts`): `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, `transformOptions: { enableImplicitConversion: true }`.
  - Cualquier campo no declarado en el DTO → 400 (rechazado, no ignorado).
  - Los parámetros de ruta (`@Param('id')`) tipados como `number` en la firma del método se convierten automáticamente a número — el frontend igual debe mandarlos como string en la URL (son parte del path).
  - Los query params booleanos de `PropertyFilterDto` (`garage`, `patio`, `property_deed`, `tractoAbreviado`, `boleto`) son **strings** `"true"`/`"false"` (`@IsBooleanString`), no booleanos JSON — son query params de URL.
- **CORS:** `credentials: true`. El frontend **debe** mandar `credentials: 'include'` (fetch) o `withCredentials: true` (axios) en TODAS las requests, incluso las que no requieren auth, para que la cookie de sesión viaje.
- **Cookie de sesión:** nombre exacto `access_token`. `httpOnly: true`, `sameSite: 'lax'`, `secure` solo si `NODE_ENV=production`. `maxAge` derivado de `JWT_EXPIRATION_TIME` (si no está seteada, 24h). El frontend **no puede leer esta cookie desde JS** (httpOnly) — el estado de sesión se obtiene llamando a `GET /auth/me`.
- **Headers especiales:** ninguno además de la cookie. No hay `Authorization: Bearer` — todo pasa por la cookie `access_token`. `helmet()` está activo (agrega headers de seguridad estándar en la respuesta: `X-Content-Type-Options`, `X-Frame-Options`, etc.) pero no afecta el body ni requiere headers especiales del cliente.
- **Rate limiting:** global 100 requests/min por IP (`ThrottlerGuard`). `/auth/register`, `/auth/login`, `/auth/google` tienen límite propio de **5 requests/min por IP**. Al superarse → `429` (shape exacto en la sección de errores).
- **Zona horaria / fechas:** todos los campos `Date` de TypeORM (`createdAt`, `updatedAt`, `created_at`, `updated_at`) serializan a **string ISO 8601** en el JSON de respuesta (ej. `"2026-07-19T14:32:10.123Z"`).
- **Agregados numéricos de Postgres:** los resultados de `COUNT(*)`, `AVG(...)`, `MIN(...)`, `MAX(...)`, `ROUND(...)` obtenidos vía `createQueryBuilder(...).getRawOne()/getRawMany()` o `repo.query(...)` (raw SQL) llegan como **strings**, no números — es el comportamiento del driver `pg` para evitar pérdida de precisión en `bigint`/`numeric`. Esto afecta principalmente al módulo `stats` y a `feedback/search/stats/zones`. Se indica explícitamente en cada caso.
- **`typeOfProperty` es `eager: true`** en la entidad `Property` — se incluye automáticamente en **toda** respuesta que contenga una `Property`, sin importar qué `relations` se hayan pedido explícitamente (incluso anidado dentro de `Favorite.property`, `Comment.property`, `Rating.property`).
- **`PropertyImages.property` tiene `@Exclude()` pero el `ClassSerializerInterceptor` NO está registrado globalmente** → el decorador no tiene efecto real. En los endpoints donde se carga la relación `property` de una imagen explícitamente (`GET /property-images/:id`, `PATCH /property-images/:id/set-cover`), el objeto `property` completo **SÍ aparece** en la respuesta JSON.
- **Campo `password` de `User`:** columna `select: false` — nunca se carga en queries normales (`find`, `findOne`, `findOneBy`), por lo que está ausente en casi todas las respuestas. **Excepción real:** si el body de `PATCH /users/:id` o `PATCH /users/me` incluye `password`, el objeto de respuesta **sí incluye un campo `password` con el nuevo hash bcrypt** (efecto secundario de cómo se arma el objeto antes de guardarlo — no se sanitiza en esa respuesta puntual). Documentado explícitamente en esa sección.

---

## 1. Formato de errores

### 1.a Excepciones HTTP estándar de NestJS (`NotFoundException`, `ConflictException`, `ForbiddenException`, `UnauthorizedException`, `BadGatewayException`, `InternalServerErrorException`, y `BadRequestException` cuando se llama con un solo string)

Shape exacto (verificado contra `node_modules/@nestjs/common/exceptions/http.exception.js`):

```json
{
  "statusCode": 404,
  "message": "El usuario no existe",
  "error": "Not Found"
}
```

El campo `error` es el nombre estándar de HTTP para ese status (`"Bad Request"`, `"Unauthorized"`, `"Forbidden"`, `"Not Found"`, `"Conflict"`, `"Bad Gateway"`, `"Internal Server Error"`). `message` es siempre un **string simple** en este caso (nunca array).

### 1.b Fallo de `class-validator` (ValidationPipe global o `JsonToDtoPipe`)

Cuando el body/query no cumple los decoradores del DTO:

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

`message` es un **array de strings**, uno por cada constraint violada (puede tener 1 o más elementos). Los mensajes son los que genera `class-validator` por defecto en **inglés** (ej. `"email must be an email"`), EXCEPTO en los DTOs donde se definió un `message` custom en el decorador — esos aparecen en español dentro del mismo array:

- `UpdateRequestStatusDto.status` → `"Estado inválido. Valores permitidos: enviado, en_revision, aceptado, rechazado"`
- `CreateRequestPropertyDto.tipoPropiedad` → `"tipoPropiedad inválido. Valores permitidos: Casa, Departamento, Terreno, Local, Oficina, Quinta"`
- `CreateRequestPropertyDto.tipoOperacion` → `"tipoOperacion inválido. Valores permitidos: Venta, Alquiler, Alquiler temporal"`
- `CreateRequestPropertyDto.estadoConservacion` → `"estadoConservacion inválido. Valores permitidos: Excelente, Muy bueno, Bueno, Regular, A refaccionar"`
- `GoogleLoginDto.idToken` (vacío) → `"El idToken de Google es obligatorio"`
- `PropertyFilterDto.status` → `"status inválido. Valores permitidos: disponible, pendiente, vendida, alquilada, eliminado, en pausa"`

Un campo extra no declarado en el DTO (`forbidNonWhitelisted`) también cae en este shape, con un mensaje tipo `"property xyz should not exist"`.

### 1.c `POST/PATCH /properties` con el campo `data` inválido (`JsonToDtoPipe`)

- `data` ausente o vacío → `{ "statusCode": 400, "message": "El campo 'data' es obligatorio y debe ser JSON válido", "error": "Bad Request" }`
- `data` no es JSON parseable → `{ "statusCode": 400, "message": "El campo 'data' debe ser JSON válido", "error": "Bad Request" }`
- `data` es JSON válido pero no cumple el DTO → mismo shape que 1.b (`message` es array de strings).

### 1.d Rate limit excedido (429)

Shape exacto (verificado contra `node_modules/@nestjs/throttler`):

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

**Sin campo `error`** (es la única excepción del backend que no lo tiene — no usa el mismo constructor interno que las demás). Header de respuesta adicional: `Retry-After` (segundos) quedará presente solo si el bloqueo está activo; en requests normales dentro del límite se agregan los headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

### 1.e Error interno no controlado (caso teórico, no debería verse en uso normal)

```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```

Sin `error` field tampoco. En la práctica, los services de este backend capturan sus errores y los convierten en `InternalServerErrorException(mensajeGenérico)` (shape 1.a), así que este caso genérico solo aparecería ante un bug no previsto.

---

## 2. Enums (valores EXACTOS, case-sensitive)

```ts
// src/modules/users/enums/role.enum.ts — usado en User.role, JWT payload
enum Role { USER = 'user', ADMIN = 'admin' }

// src/modules/properties/dto/enumsStatusProperty.ts — Property.status, PropertyFilterDto.status
enum StatusProperty {
  DISPONIBLE = 'disponible',
  PENDIENTE = 'pendiente',
  VENDIDO = 'vendida',      // ⚠️ el KEY dice VENDIDO pero el VALUE es 'vendida'
  ALQUILADA = 'alquilada',
  ELIMINADO = 'eliminado',
  PAUSADO = 'en pausa',     // ⚠️ el VALUE tiene un espacio: "en pausa"
}

// src/modules/properties/dto/enumsStatusProperty.ts — Property.operationType, PropertyFilterDto.operationType, SearchPreference.operationType
enum OperationType {
  VENTA = 'venta',
  ALQUILER = 'alquiler',
  ALQUILER_TEMPORAL = 'temporal',   // ⚠️ el value NO es "alquiler_temporal", es "temporal"
}

// src/modules/PropertyRequest/entities/PropertyRequest.ts — PropertyRequest.status, UpdateRequestStatusDto.status
enum RequestStatus {
  ENVIADO = 'enviado',
  REVISION = 'en_revision',
  ACEPTADO = 'aceptado',
  RECHAZADO = 'rechazado',
}
// Transiciones válidas (PATCH /property-requests/:id/status), cualquier otra combinación → 409:
//   enviado      → en_revision | aceptado | rechazado
//   en_revision  → aceptado | rechazado
//   aceptado     → (ninguna, es terminal)
//   rechazado    → en_revision

// src/modules/PropertyRequest/dto/enumsPropertyRequest.ts — SOLO en CreateRequestPropertyDto (la entidad guarda string libre)
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

// src/modules/requests/entities/request.entity.ts Y src/modules/requests/dto/create-request.dto.ts
// (declarados DOS VECES de forma idéntica — mismo valor de string, usar cualquiera de los dos)
// Usado en UserSearchFeedback / CreateUserSearchFeedbackDto — es un enum DISTINTO del OperationType de arriba
enum OperationType_Feedback {  // nombre real: OperationType, pero acá tiene solo 2 valores (no "temporal")
  ALQUILER = 'alquiler',
  VENTA = 'venta',
}
enum PropertyTypeEnum {
  CASA = 'casa', DEPARTAMENTO = 'departamento', TERRENO = 'terreno',
  LOCAL = 'local', OFICINA = 'oficina',
}
```

**`PropertyType` (tipos de propiedad: property-types) NO es un enum** — es una entidad de base de datos dinámica (`{ id: number, name: string }`). Los valores válidos se obtienen en runtime con `GET /property-types`, no están fijos en el código.

---

## 3. Módulo `auth`

| Método | Ruta | Auth | Throttle |
|---|---|---|---|
| POST | `/auth/register` | Público | 5/min |
| POST | `/auth/login` | Público | 5/min |
| POST | `/auth/google` | Público | 5/min |
| GET | `/auth/me` | JWT requerido | — |
| POST | `/auth/logout` | JWT requerido | — |

### POST /auth/register
Body (`RegisterDto`):
```ts
{
  name: string;           // @IsString()
  surname: string;        // @IsString()
  phone: string;          // @IsString()
  photo?: string;         // @IsOptional() @IsString()
  email: string;          // @IsEmail() — se normaliza a trim+lowercase antes de validar
  password: string;       // @IsString() @MinLength(5)
}
// NO acepta: id, createdAt, updatedAt, role (forbidNonWhitelisted → 400 si se envían)
```
Response 201 — objeto `User` (ver interfaz `User` en la sección 8), **sin password, sin cookie seteada** (register NO loguea):
```json
{ "id": 12, "name": "...", "surname": "...", "phone": "...", "photo": null, "email": "...", "profileIncomplete": false, "role": "user", "notifyBroadcast": true, "tokenVersion": 0, "createdAt": "...", "updatedAt": "..." }
```
Errores: 400 genérico `"No se pudo completar el registro. Verificá los datos ingresados."` si el email ya existe (mismo mensaje sea cual sea el motivo real — no distingue).

### POST /auth/login
Body (`LoginDto`):
```ts
{ email: string; password: string; }  // @IsEmail(), @IsString() @MinLength(5)
```
Response 201 (Nest devuelve 201 para POST por defecto, no 200) — `Set-Cookie: access_token=...`:
```json
{ "message": "Login exitoso", "user": { /* User, sin password */ } }
```
Errores: **401** `"Credenciales inválidas"` para los 3 casos (usuario no existe, usuario es de Google sin password local, password incorrecto) — mensaje idéntico en los 3, no distinguible desde el response.

### POST /auth/google
Body (`GoogleLoginDto`):
```ts
{ idToken: string; }  // @IsString() @IsNotEmpty()
```
Response 201, `Set-Cookie: access_token=...`:
```json
{ "message": "Login con Google exitoso", "user": { /* User, sin password */ } }
```
Si es un usuario nuevo, se crea con `profileIncomplete: true`, `phone: ""`, `role: "user"`.
Errores: 400 `"El idToken de Google es obligatorio"` (vacío/ausente) · 400 `"No se pudo verificar el token de Google"` (token inválido/expirado) · 400 `"Token inválido"` (sin email en el payload) · **401** `"El token no fue emitido para esta aplicación"` (audience mismatch) · **401** `"El email de la cuenta de Google no está verificado"`.

### GET /auth/me
Requiere JWT. Response 200 — objeto `User` (sin password), o **401** si el token es inválido/expirado/revocado (`"Sesión inválida"`, o vacío por passport si no hay cookie).

### POST /auth/logout
Requiere JWT. Invalida el token actual y TODOS los emitidos previamente (incrementa `tokenVersion` en DB). Borra la cookie. Response 201:
```json
{ "message": "Logout exitoso" }
```

---

## 4. Módulo `users`

| Método | Ruta | Auth |
|---|---|---|
| POST | `/users` | **Público, sin ningún guard** |
| PATCH | `/users/:id/photo` | JWT — dueño o ADMIN |
| GET | `/users` | JWT + ADMIN |
| GET | `/users/:id` | JWT (cualquier usuario logueado, no solo el dueño) |
| PATCH | `/users/me` | JWT — siempre el propio usuario |
| PATCH | `/users/:id` | JWT — dueño o ADMIN |
| DELETE | `/users/:id` | JWT + ADMIN |

### POST /users
Body (`CreateUserDto`):
```ts
{
  name: string; surname: string; phone: string;
  photo?: string;
  email: string;      // @IsEmail(), normalizado a lowercase+trim
  password: string;   // @MinLength(5)
}
// role: NO ACEPTADO (el campo no existe en el DTO — forbidNonWhitelisted rechaza con 400 si se envía)
```
Response 201 — `User` completo sin `password` (aunque el objeto pasó por hash internamente, se borra antes de responder).
Errores: 400 genérico si el email ya existe (mismo mensaje que register) · 400 si `password` < 5 caracteres.

### PATCH /users/:id/photo
Multipart `FormData`, campo `file` (imagen, máx. 5MB, `Content-Type` debe empezar con `image/`). Response 200 — `User` completo (sin password, salvo que se acabe de actualizar la foto — password nunca se toca acá así que está ausente).
Errores: 403 si no sos el dueño ni ADMIN · 400 `"No se proporcionó ninguna imagen"` · 400 `"Solo se permiten archivos de imagen (image/*)"` (si `fileFilter` rechaza) · **502** `"No pudimos procesar la imagen, intentá de nuevo"` si Cloudinary falla.

### GET /users
Solo ADMIN. Response 200 — array de `User` (sin password en ninguno).

### GET /users/:id
Cualquier usuario autenticado (no solo el dueño ni admin — ver `AUDIT`/`SECURITY_FIXES` para contexto, pero el contrato actual es este). Response 200 — `User` sin password. Errores: 404 `"El usuario no existe"`.

### PATCH /users/me
El id sale del token, no de la URL. Body (`UpdateUserDto`, todos opcionales):
```ts
{
  name?: string; surname?: string; phone?: string; photo?: string;
  email?: string;          // @IsEmail()
  password?: string;       // @IsString() — SIN @MinLength acá (a diferencia de create/register)
  notifyBroadcast?: boolean;
}
```
Response 200 — `User` actualizado. **⚠️ Si el body incluye `password`, la respuesta incluye un campo `password` extra con el NUEVO hash bcrypt** (string tipo `$2b$10$...`) — no se sanitiza en este endpoint. Si se cambia el password, la sesión actual queda revocada (hay que loguear de nuevo tras esta llamada — el siguiente request con la cookie vieja da 401).
Errores: 404 `"El usuario no existe"` · **409** `"Ese email no está disponible"` si el email nuevo ya lo tiene otro usuario.

### PATCH /users/:id
Mismo body y mismo comportamiento (incluido el quirk del password en la respuesta) que `PATCH /users/me`, pero el id va en la URL y requiere ser el dueño o ADMIN (403 si no). Mismos errores 404/409.

### DELETE /users/:id
Solo ADMIN. Response 200:
```json
{ "message": "Usuario eliminado correctamente por el administrador" }
```
Errores: 404 `"El usuario no existe"`.

---

## 5. Módulo `properties`

| Método | Ruta | Auth |
|---|---|---|
| GET | `/properties` | Público |
| GET | `/properties/filter` | Público |
| GET | `/properties/:id` | Público |
| GET | `/properties/filters/locations` | Público |
| POST | `/properties` | JWT + ADMIN |
| PATCH | `/properties/:id` | JWT + ADMIN |
| DELETE | `/properties/:id` | JWT + ADMIN |
| DELETE | `/properties/image/:id` | JWT + ADMIN |

### GET /properties
Response 200 — **array plano** (no paginado) de propiedades, cada una es el objeto `Property` completo + `ratingAverage: number` extra, con relaciones `agent`, `ratings`, `typeOfProperty` (siempre, es eager), `images`.

### GET /properties/filter
Query params (`PropertyFilterDto`, todos opcionales salvo defaults):
```ts
{
  page?: number = 1; limit?: number = 10;         // @IsInt @Min(1), limit además @Max(100)
  title?: string; zone?: string;
  rooms?: number; bathrooms?: number; typeOfPropertyId?: number;
  minPrice?: number; maxPrice?: number; maxAntiquity?: number;
  minSupTotal?: number; maxSupTotal?: number;       // superficie total
  minSupCubierta?: number; maxSupCubierta?: number; // superficie cubierta
  // Documentación legal: independientes entre sí, se pueden combinar
  garage?: "true" | "false"; patio?: "true" | "false"; property_deed?: "true" | "false"; tractoAbreviado?: "true" | "false"; boleto?: "true" | "false"; // strings, no boolean JSON
  status?: StatusProperty;      // default implícito: DISPONIBLE si no se manda
  provincia?: string; localidad?: string; barrio?: string; direccion?: string; // direccion: ILIKE parcial
  operationType?: OperationType;
  search?: string;              // texto libre, parseado con NLP simple (detecta tipo, operación, metros → supTotal, ambientes, precio, antigüedad)
}
```
Response 200 — **envuelto**, no plano:
```ts
{
  data: Property[];   // con typeOfProperty, images, agent cargados
  meta: {
    totalItems: number;
    itemCount: number;
    totalPages: number;
    currentPage: number;
  };
}
```

### GET /properties/:id
Response 200 — objeto `Property` + `ratingAverage: number`, con relaciones `agent`, `comments`, `ratings`, `favorites`, `referredBy`, `typeOfProperty`, `images`.
Errores: 404 `"No existe la propiedad con ID {id}"`.

### GET /properties/filters/locations
Response 200:
```ts
{ localidades: string[]; barrios: string[]; zones: string[]; }
```

### POST /properties
**Multipart/form-data**, no JSON body puro:
- campo `data`: string JSON con la forma de `CreatePropertyDto` (ver abajo).
- campo `images`: hasta 10 archivos (`image/*`, máx. 5MB c/u).

`data` JSON esperado (`CreatePropertyDto`):
```ts
{
  title: string; description: string;
  typeOfPropertyId: number;             // debe existir en property-types
  operationType: OperationType;         // 'venta' | 'alquiler' | 'temporal'
  // Documentación legal: independientes entre sí, se pueden combinar
  property_deed: boolean; tractoAbreviado: boolean; boleto: boolean;
  provincia: string; localidad: string; barrio: string; direccion: string; zone: string;
  rooms: number; bathrooms: number;
  garage: boolean; patio: boolean;
  supTotal: number; supCubierta: number; antiquity: number; price: number;
  status: StatusProperty;
}
```
Ejemplo real del contenido del campo `data`:
```json
{"title":"Casa 3 amb","description":"...","typeOfPropertyId":1,"operationType":"venta","property_deed":true,"tractoAbreviado":false,"boleto":false,"provincia":"Córdoba","localidad":"Villa Carlos Paz","barrio":"La Cuesta","direccion":"Av. San Martín 1250","zone":"Norte","rooms":3,"bathrooms":2,"garage":true,"patio":true,"supTotal":120,"supCubierta":90,"antiquity":5,"price":150000,"status":"disponible"}
```
Response 201:
```ts
{
  // ...todos los campos de Property (id, title, description, ..., created_at, updated_at)
  agent: { id: number };                     // objeto parcial, solo id
  typeOfProperty: { id: number; name: string }; // objeto completo del tipo
  images: Array<{ id: number; url: string; hash: string; isCover: boolean; publicId: string }>;
  // NOTA: ratings, comments, favorites, referredBy NO están presentes en esta respuesta (sí en el GET :id posterior)
}
```
El `agent` se asigna automáticamente con el id del admin autenticado (token), no se manda en `data`.
Errores: 404 si `typeOfPropertyId` no existe · **502** `"No se pudieron procesar las imágenes. Intentá de nuevo."` si Cloudinary falla (en ese caso la property NO queda creada — se hace rollback) · 400 de `JsonToDtoPipe` (ver 1.c).

### PATCH /properties/:id
Multipart: campo `data` = JSON de `UpdatePropertyDto` (todos los campos de `CreatePropertyDto` como opcionales, más):
```ts
{
  // ...todos opcionales, mismos campos que CreatePropertyDto
  deleteImages?: number[];       // ids de PropertyImages a borrar
  setCoverImageId?: number;      // id de la imagen a marcar como portada
}
```
campo `newImages`: hasta 10 archivos nuevos.
Response 200 — mismo shape que `GET /properties/:id` (recarga completa con `ratingAverage` y todas las relaciones).
Errores: 404 propiedad inexistente · 404 `typeOfPropertyId` inexistente.

### DELETE /properties/:id
Response 200: `{ "message": "Propiedad {id} eliminada correctamente" }`. Errores: 404.

### DELETE /properties/image/:id
Delega a `propertyImagesService.deleteImage`. Response 200: `{ "message": "Imagen eliminada correctamente." }`. Errores: 404 `"Imagen no encontrada"`.

---

## 6. Módulo `ImagesProperty` (`property-images`)

Todo el controller requiere JWT (`GET :id` no requiere rol específico — cualquier usuario logueado; `set-cover` y `DELETE` requieren ADMIN).

| Método | Ruta | Auth |
|---|---|---|
| GET | `/property-images/:id` | JWT |
| PATCH | `/property-images/:id/set-cover` | JWT + ADMIN |
| DELETE | `/property-images/:id` | JWT + ADMIN |

### GET /property-images/:id
Response 200 — objeto `PropertyImages` **con la relación `property` completa anidada** (el `@Exclude()` de la entidad no tiene efecto real, ver nota global):
```ts
{ id: number; url: string; hash: string; isCover: boolean; publicId: string; property: Property /* completa */ }
```
Errores: 404 `"Imagen no encontrada"`.

### PATCH /property-images/:id/set-cover
Response 200:
```ts
{ message: "Imagen establecida como portada correctamente."; image: PropertyImages /* con property anidada */ }
```
Errores: 404 `"Imagen no encontrada"` · 404 `"La imagen no tiene una propiedad asociada"` (relación rota).

### DELETE /property-images/:id
Response 200: `{ "message": "Imagen eliminada correctamente." }`. Errores: 404 `"Imagen no encontrada"`.

---

## 7. Módulo `typeOfProperty` (`property-types`)

| Método | Ruta | Auth |
|---|---|---|
| POST | `/property-types` | JWT + ADMIN |
| GET | `/property-types` | Público |
| GET | `/property-types/:id` | Público |
| PATCH | `/property-types/:id` | JWT + ADMIN |
| DELETE | `/property-types/:id` | JWT + ADMIN |

Body create/update:
```ts
{ name: string; }  // @IsString() @MinLength(3) — create obligatorio, update opcional
```
Response create/get/update: `{ id: number; name: string; }`. Response list: array de eso.
Errores: **409** `"Ese tipo de propiedad ya existe."` (nombre duplicado en create) · 404 `"Tipo de propiedad no encontrado."` · **409** `"No se puede eliminar: hay propiedades usando este tipo"` (delete con properties asociadas).
DELETE response: `{ "message": "Tipo de propiedad eliminado" }`.

---

## 8. Módulo `favorites`

Todo requiere JWT; el `userId` sale SIEMPRE del token, nunca de la URL.

| Método | Ruta |
|---|---|
| POST | `/favorites/:propertyId` |
| GET | `/favorites` |
| DELETE | `/favorites/all` |
| DELETE | `/favorites/:propertyId` |

### POST /favorites/:propertyId
Sin body. Response 201 — objeto `Favorite` con `user` y `property` **completos anidados** (no solo ids):
```ts
{ user_id: number; property_id: number; user: User /* sin password */; property: Property /* completa, eager typeOfProperty incluido */ }
```
Errores: 404 `"No se encontró al usuario"` / `"No se encontró la propiedad"` · **409** `"La propiedad ya está en favoritos"`.

### GET /favorites
Response 200 — array de `Favorite`, cada uno con `property` (incluyendo `property.images` y `property.typeOfProperty` cargados explícitamente) — **`user` NO está cargado en este endpoint** (solo en el POST).

### DELETE /favorites/all
Response 200: `{ "message": "Todos los favoritos fueron eliminados" }`.

### DELETE /favorites/:propertyId
Response 200: `{ "message": "Favorito eliminado correctamente" }`. Errores: 404 `"El favorito no existe"`.

---

## 9. Módulo `ratings`

| Método | Ruta | Auth |
|---|---|---|
| POST | `/ratings/:propertyId` | JWT |
| GET | `/ratings/:propertyId` | Público |

### POST /ratings/:propertyId
Body:
```ts
{ score: number; }  // @IsInt() @Min(1) @Max(5)
```
Un usuario solo puede tener 1 rating por propiedad — si ya existe, este endpoint lo **actualiza** en vez de crear uno nuevo. **El shape de la respuesta difiere según el caso:**
- Caso actualización (ya existía): `{ id, score, userId, propertyId, user: User /* completo */, property: Property /* completa */ }`.
- Caso creación (primera vez): `{ id, score, userId, propertyId, user: { id: number }, property: { id: number } }` — objetos **parciales**, solo el id.

Errores: 400 `"El puntaje debe ser entre 1 y 5"` (chequeo redundante con el DTO) · 404 `"La propiedad indicada no existe"` · **409** `"Ya valoraste esta propiedad"` (carrera de dos requests simultáneos).

### GET /ratings/:propertyId
Response 200 — array de ratings con forma reducida:
```ts
{ id: number; score: number; userId: number; user: { id: number; name: string; photo: string | null } }[]
```

---

## 10. Módulo `comments` (anidado bajo properties)

Ruta base: `/properties/:propertyId/comments`.

| Método | Ruta | Auth |
|---|---|---|
| POST | `/properties/:propertyId/comments` | JWT |
| GET | `/properties/:propertyId/comments` | Público |
| PATCH | `/properties/:propertyId/comments/:commentId` | JWT — dueño |
| DELETE | `/properties/:propertyId/comments/:commentId` | JWT — dueño o ADMIN |

### POST .../comments
Body: `{ message: string; }` (`@IsString() @IsNotEmpty() @MaxLength(500)`).
Response 201 — `Comment` con `user` y `property` completos anidados:
```ts
{ id, message, created_at, userId, propertyId, user: User /* sin password */, property: Property }
```
Errores: 404 `"La propiedad no existe"` · 404 `"El usuario no existe"`.

### GET .../comments
Response 200 — array, forma reducida:
```ts
{ id, message, created_at, userId, propertyId, user: { id, name, surname, photo } }[]
```

### PATCH .../comments/:commentId
Body: `{ message?: string; }`. Response 200 — `Comment` con `user` cargado (`property` NO cargado en este endpoint).
Errores: 404 `"El comentario no existe"` · **403** `"No podés editar un comentario que no es tuyo"`.

### DELETE .../comments/:commentId
Response 200: `{ "message": "Comentario eliminado correctamente" }`.
Errores: 404 `"El comentario no existe"` · **403** `"No tenés permiso para eliminar este comentario"`.

---

## 11. Módulo `notifications`

Todo requiere JWT (rutas `/admin` requieren además ADMIN).

| Método | Ruta | Auth |
|---|---|---|
| GET | `/notifications` | JWT |
| PATCH | `/notifications/:id/read` | JWT |
| PATCH | `/notifications/read-all` | JWT |
| GET | `/notifications/admin` | JWT + ADMIN |
| PATCH | `/notifications/admin/read-all` | JWT + ADMIN |

### GET /notifications
Response 200 — array de `Notification` (del usuario logueado), **sin relación `user` cargada** (campo `user` ausente en el JSON):
```ts
{ id, title, message, propertyId: number | null, read: boolean, targetRole: 'user' | 'admin', relatedUserId: number | null, createdAt }[]
```

### PATCH /notifications/:id/read
Response 200: `{ "message": "Notificación marcada como leída" }`. Un ADMIN puede marcar también notificaciones con `targetRole: 'admin'` (sin dueño). Errores: 404 `"Notificación no encontrada"` (id inexistente o de otro usuario).

### PATCH /notifications/read-all
Response 200: `{ "message": "Todas las notificaciones marcadas como leídas" }`.

### GET /notifications/admin
Response 200 — array de `Notification` con `targetRole: "admin"`.

### PATCH /notifications/admin/read-all
Response 200: `{ "message": "Todas las notificaciones del admin marcadas como leídas" }`.

---

## 12. Módulo `search-preferences`

Todo requiere JWT.

| Método | Ruta | Auth |
|---|---|---|
| POST | `/search-preferences` | JWT |
| PATCH | `/search-preferences` | JWT |
| GET | `/search-preferences` | JWT |
| GET | `/search-preferences/user/:id` | JWT + ADMIN |

### POST /search-preferences
Body (`CreateSearchPreferenceDto`, todos opcionales):
```ts
{
  zone?: string; localidad?: string; barrio?: string;
  garage?: boolean; patio?: boolean;
  operationType?: OperationType;         // 'venta' | 'alquiler' | 'temporal'
  // Documentación legal: independientes entre sí, se pueden combinar
  property_deed?: boolean; tractoAbreviado?: boolean; boleto?: boolean;
  typeOfPropertyId?: number;
  preferredPrice?: number;    // @Min(0)
  minRooms?: number;          // @Min(0)
  minBathrooms?: number;      // @Min(0)
  supTotal?: number;          // @Min(0)
  supCubierta?: number;       // @Min(0)
  maxAntiquity?: number;      // @Min(0)
  notifyNewMatches?: boolean;
  notifyPriceDrops?: boolean;
}
```
Response 201 — `SearchPreference` con `typeOfProperty` y `user` cargados:
```ts
{ id, zone, localidad, barrio, operationType, typeOfProperty: PropertyType | null, property_deed, tractoAbreviado, boleto, preferredPrice, minRooms, minBathrooms, supTotal, supCubierta, garage, patio, maxAntiquity, notifyNewMatches: boolean /* default true */, notifyPriceDrops: boolean /* default true */, createdAt, updatedAt, user: User /* sin password */ }
```
Errores: 404 si `typeOfPropertyId` no existe.

### PATCH /search-preferences
Mismo body (parcial). Si el usuario no tiene preferencia previa, esta ruta la **crea** (upsert). Response 200/201 — mismo shape que POST.

### GET /search-preferences
Response 200 — `SearchPreference` del usuario logueado, o **`null`** (200 con body `null`) si no tiene ninguna guardada.

### GET /search-preferences/user/:id
Solo ADMIN. Mismo shape de respuesta que `GET /search-preferences` (o `null`).

---

## 13. Módulo `PropertyRequest` (`property-requests`)

Todo el controller requiere JWT como mínimo.

| Método | Ruta | Auth |
|---|---|---|
| POST | `/property-requests` | JWT (cualquier usuario) |
| GET | `/property-requests/my-requests` | JWT |
| GET | `/property-requests` | JWT + ADMIN |
| GET | `/property-requests/user/:userId` | JWT + ADMIN |
| GET | `/property-requests/:id` | JWT + ADMIN |
| PATCH | `/property-requests/:id/status` | JWT + ADMIN |
| DELETE | `/property-requests/:id` | JWT + ADMIN |
| GET | `/property-requests/my-requests/:id` | JWT — dueño |

### POST /property-requests
Body (`CreateRequestPropertyDto`):
```ts
{
  localidad: string; barrio: string; direccion: string;
  pisoDepto?: string;
  tipoPropiedad: TipoPropiedadRequest;       // 'Casa'|'Departamento'|'Terreno'|'Local'|'Oficina'|'Quinta'
  tipoOperacion: TipoOperacionRequest;       // 'Venta'|'Alquiler'|'Alquiler temporal'
  estadoConservacion: EstadoConservacionRequest; // 'Excelente'|'Muy bueno'|'Bueno'|'Regular'|'A refaccionar'
  m2Totales: number;      // @Min(0)
  m2Cubiertos: number;    // @Min(0)
  habitaciones: number;   // @Min(0)
  baños: number;           // @Min(0)  ← nombre de campo con ñ
  antiguedad: number;     // @Min(0)
  orientacion?: string;
  patio: boolean; garage: boolean;
  escritura: boolean; impuestosAlDia: boolean; aptoCredito: boolean;
  precioEstimado: number; // @Min(0)
  mensajeAgente?: string;
}
```
Response 201 — `PropertyRequest` con `status: "enviado"` (fijo al crear) y **`user` cargado** (el usuario autenticado, sin password):
```ts
{ id, localidad, barrio, direccion, pisoDepto, tipoPropiedad, tipoOperacion, estadoConservacion, m2Totales, m2Cubiertos, habitaciones, baños, patio, garage, antiguedad, orientacion, escritura, impuestosAlDia, aptoCredito, precioEstimado, mensajeAgente, status: "enviado", userId, createdAt, user: User }
```

### GET /property-requests/my-requests
Response 200 — array de `PropertyRequest` del usuario, con `user` cargado.

### GET /property-requests (ADMIN)
Response 200 — array de TODAS las solicitudes, con `user` cargado.

### GET /property-requests/user/:userId (ADMIN)
Response 200 — igual que `my-requests` pero de un usuario específico.

### GET /property-requests/:id (ADMIN)
Response 200 — `PropertyRequest` individual con `user`. Errores: 404 `"La solicitud con ID {id} no existe"`.

### PATCH /property-requests/:id/status (ADMIN)
Body:
```ts
{ status: RequestStatus; }  // @IsEnum — ver enum RequestStatus arriba
```
Response 200 — `PropertyRequest` actualizado con `user` cargado.
Errores: 400 si `status` no es un valor válido del enum (mensaje que lista los valores permitidos, ver 1.b) · 404 si el id no existe · **409** `"No se puede pasar la solicitud de 'X' a 'Y'"` si la transición no está permitida (ver tabla de transiciones en la sección de enums).

### DELETE /property-requests/:id (ADMIN)
Response 200: `{ "message": "Solicitud #{id} eliminada correctamente" }`. Errores: 404.

### GET /property-requests/my-requests/:id
Response 200 — `PropertyRequest` **sin `user` cargado** (a diferencia de los otros GET de este módulo).
Errores: 404 `"La solicitud #{id} no existe."` · **403** `"No tenés permiso para ver esta solicitud."` (pertenece a otro usuario).

---

## 14. Módulo `requests` (`feedback/search` — feedback de búsqueda anónimo)

| Método | Ruta | Auth |
|---|---|---|
| POST | `/feedback/search` | Público |
| GET | `/feedback/search/check/:deviceId` | Público |
| GET | `/feedback/search/stats/zones` | JWT + ADMIN |
| GET | `/feedback/search` | JWT + ADMIN |
| GET | `/feedback/search/:id` | JWT + ADMIN |

### POST /feedback/search
Body (`CreateUserSearchFeedbackDto`):
```ts
{
  rooms?: number; bathrooms?: number; zone?: string; localidad?: string; barrio?: string;
  priceMin?: number; priceMax?: number;
  propertyType?: PropertyTypeEnum;   // 'casa'|'departamento'|'terreno'|'local'|'oficina'
  operationType?: OperationType;     // 'alquiler'|'venta' (solo 2 valores, distinto del OperationType de properties)
  antiquityMax?: number;
  hasGarage?: boolean; hasPatio?: boolean;
  notes?: string;
  deviceId: string;   // @IsUUID('4') — obligatorio
}
```
Response 201 — **NO devuelve la entidad completa**:
```ts
{ message: "Preferencias guardadas. ¡Gracias por ayudarnos a mejorar!"; id: number; }
```
Anti-spam: si el mismo `deviceId` ya envió algo en las últimas 24hs → 400 `"Ya hemos recibido tu búsqueda. Puedes enviar otra en 24 horas."` · 400 `"El deviceId es obligatorio para evitar spam."` si falta.

### GET /feedback/search/check/:deviceId
Response 200:
```ts
{ canSend: boolean; nextAllowed: string | null; }  // nextAllowed es Date serializada a ISO string, o null si canSend=true
```

### GET /feedback/search/stats/zones (ADMIN)
Response 200 — **valores numéricos como strings** (raw SQL, ver nota global):
```ts
{
  topZones: { name: string; value: string }[];   // top 5 localidades
  topTypes: { type: string; total: string }[];   // todos los tipos
  totalRequests: number;   // este SÍ es number (viene de repo.count(), no de raw query)
}
```

### GET /feedback/search (ADMIN)
Response 200 — array de `UserSearchFeedback` completo.

### GET /feedback/search/:id (ADMIN)
Response 200 — `UserSearchFeedback`. Errores: 404 `"No se encontró el registro con ID {id}"`.

---

## 15. Módulo `stats`

**Todo el controller requiere JWT + ADMIN** (a nivel controller). Todos son GET, sin body ni params. ⚠️ **Los valores numéricos de casi todos estos endpoints son strings** (raw Postgres, ver nota global) — la única excepción documentada es el guard de "sin datos" que devuelve números literales `0`.

| Ruta | Response (vacío si no hay datos → `[]` salvo que se indique otro caso) |
|---|---|
| `GET /stats/property-type` | `{ propertyType: string \| null; count: string; percentage: string }[]` |
| `GET /stats/property-type/top` | `{ propertyType: string \| null; count: string } \| undefined` |
| `GET /stats/property-type/least` | `{ propertyType: string \| null; count: string } \| undefined` |
| `GET /stats/operation-type` | `{ operationType: string \| null; count: string; percentage: string }[]` |
| `GET /stats/operation-type/top` | `{ operationType: string \| null; count: string } \| undefined` |
| `GET /stats/operation-type/least` | `{ operationType: string \| null; count: string } \| undefined` |
| `GET /stats/zones` | `{ zone: string \| null; count: string; percentage: string }[]` |
| `GET /stats/cities` | `{ localidad: string \| null; count: string; percentage: string }[]` (campo `localidad`, NO `city`) |
| `GET /stats/price/average` | `{ averagePrice: string \| null }` (objeto único, `getRawOne`) |
| `GET /stats/price/ranges` | `{ range: string; count: string }[]` — `range` ∈ `"Menos de 80k"`, `"80k - 120k"`, `"120k - 200k"`, `"Más de 200k"` |
| `GET /stats/price/by-property-type` | `{ propertyType: string \| null; avgPrice: string }[]` |
| `GET /stats/price/by-zone` | `{ zone: string \| null; avgPrice: string }[]` |
| `GET /stats/price/min` | `{ lowestPrice: string \| null }` |
| `GET /stats/price/max` | `{ highestPrice: string \| null }` |
| `GET /stats/rooms/average` | `{ avgRooms: string \| null }` |
| `GET /stats/bathrooms/average` | `{ avgBathrooms: string \| null }` |
| `GET /stats/rooms/distribution` | `{ rooms: number \| null; count: string; percentage: string }[]` |
| `GET /stats/extras` | `[{ garagecount: string; garagepercentage: string; patiocount: string; patiopercentage: string }]` — **claves en minúscula** (Postgres pliega identificadores sin comillas). Si no hay datos: `[{ garagecount: 0, garagepercentage: 0, patiocount: 0, patiopercentage: 0 }]` (números literales, no strings) |
| `GET /stats/extras/patio` | Idéntico a `/stats/extras` (implementación duplicada) |
| `GET /stats/extras/garage` | Idéntico a `/stats/extras` (implementación duplicada) |
| `GET /stats/antiquity/average` | `{ avgAntiquity: string \| null }` |
| `GET /stats/antiquity/new-construction` | `{ count: string; percentage: string }` con datos, o `{ count: 0, percentage: 0 }` (números literales) sin datos |

---

## 16. Guards y roles — referencia rápida

- **`@Public()`**: la ruta NO requiere JWT (usado en lecturas de properties, property-types, filters/locations).
- **Sin guard alguno**: `POST /users` es el único endpoint de escritura totalmente público (sin `@UseGuards`).
- **JWT sin rol específico**: cualquier usuario autenticado, sea `user` o `admin` (ej. `GET /users/:id`, `GET /property-images/:id`, `POST /search-preferences`).
- **`@Roles(Role.ADMIN)` + `RolesGuard`**: requiere `role: "admin"` en el usuario del token — si no, **403** `"No tienes permisos para acceder a este recurso"` (o el mensaje específico del controller si lo sobreescribe manualmente, ej. en `users.controller.ts`: `"No tienes permiso para actualizar este usuario"`).
- El objeto `req.user` (disponible en todo endpoint con JWT) tiene siempre esta forma exacta, sin importar el endpoint: `{ id: number; email: string; role: 'user' | 'admin' }` — nunca incluye más campos (viene de `JwtStrategy.validate()`, consulta la DB en cada request).

---

## 17. TIPOS TYPESCRIPT SUGERIDOS

```ts
// ============================================================
// ENUMS
// ============================================================

export enum Role {
  USER = 'user',
  ADMIN = 'admin',
}

export enum StatusProperty {
  DISPONIBLE = 'disponible',
  PENDIENTE = 'pendiente',
  VENDIDO = 'vendida',
  ALQUILADA = 'alquilada',
  ELIMINADO = 'eliminado',
  PAUSADO = 'en pausa',
}

export enum OperationType {
  VENTA = 'venta',
  ALQUILER = 'alquiler',
  ALQUILER_TEMPORAL = 'temporal',
}

export enum RequestStatus {
  ENVIADO = 'enviado',
  REVISION = 'en_revision',
  ACEPTADO = 'aceptado',
  RECHAZADO = 'rechazado',
}

export enum TipoPropiedadRequest {
  CASA = 'Casa',
  DEPARTAMENTO = 'Departamento',
  TERRENO = 'Terreno',
  LOCAL = 'Local',
  OFICINA = 'Oficina',
  QUINTA = 'Quinta',
}

export enum TipoOperacionRequest {
  VENTA = 'Venta',
  ALQUILER = 'Alquiler',
  ALQUILER_TEMPORAL = 'Alquiler temporal',
}

export enum EstadoConservacionRequest {
  EXCELENTE = 'Excelente',
  MUY_BUENO = 'Muy bueno',
  BUENO = 'Bueno',
  REGULAR = 'Regular',
  A_REFACCIONAR = 'A refaccionar',
}

// ============================================================
// ENTIDADES / RESPONSES
// ============================================================

/** Forma "segura" del usuario: la que devuelve la API en el 99% de los casos (sin password) */
export interface User {
  id: number;
  name: string;
  surname: string | null;
  phone: string | null;
  photo: string | null;
  email: string;
  profileIncomplete: boolean;
  role: Role;
  notifyBroadcast: boolean;
  tokenVersion: number;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
  /** Solo presente en la respuesta de PATCH /users/:id o /users/me cuando el body incluía `password` — es el nuevo hash bcrypt */
  password?: string;
}

export interface PropertyType {
  id: number;
  name: string;
}

export interface PropertyImage {
  id: number;
  url: string;
  hash: string;
  isCover: boolean;
  publicId: string;
  /** Solo presente en GET /property-images/:id y PATCH .../set-cover */
  property?: Property;
}

export interface Property {
  id: number;
  title: string;
  description: string;
  provincia: string;
  localidad: string;
  barrio: string;
  /** Calle y número — fuente del mapa en el detalle. Null en las cargadas antes de este campo. */
  direccion: string | null;
  zone: string;
  rooms: number;
  bathrooms: number;
  /** Documentación legal: independientes entre sí, se pueden combinar */
  property_deed: boolean;
  tractoAbreviado: boolean;
  boleto: boolean;
  garage: boolean;
  patio: boolean;
  supTotal: number | null;
  supCubierta: number | null;
  antiquity: number;
  price: number;
  status: StatusProperty;
  created_at: string;
  updated_at: string;
  images: PropertyImage[];
  agent: { id: number } | User; // { id } en la respuesta de POST /properties; User completo en otros GET
  operationType: OperationType;
  typeOfProperty: PropertyType; // SIEMPRE presente (eager)
  ratings?: Rating[];
  comments?: Comment[];
  favorites?: Favorite[];
  referredBy?: User;
  /** Solo presente en GET /properties y GET /properties/:id */
  ratingAverage?: number;
}

export interface Rating {
  id: number;
  score: number;
  userId: number;
  propertyId: number;
  user: { id: number } | User; // parcial al crear, completo al actualizar (ver sección 9)
  property: { id: number } | Property;
}

export interface Favorite {
  user_id: number;
  property_id: number;
  user?: User; // solo en el POST
  property: Property;
}

export interface Comment {
  id: number;
  message: string;
  created_at: string;
  userId: number;
  propertyId: number;
  user: User | Pick<User, 'id' | 'name' | 'surname' | 'photo'>;
  property?: Property; // solo en POST
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  propertyId: number | null;
  read: boolean;
  targetRole: 'user' | 'admin';
  relatedUserId: number | null;
  createdAt: string;
}

export interface SearchPreference {
  id: number;
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
  user: User;
}

export interface PropertyRequest {
  id: number;
  localidad: string;
  barrio: string;
  direccion: string;
  pisoDepto: string | null;
  tipoPropiedad: string; // libre en la entidad; restringido a TipoPropiedadRequest solo al crear
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
  precioEstimado: number;
  mensajeAgente: string | null;
  status: RequestStatus;
  userId: number;
  createdAt: string;
  user?: User; // ausente solo en GET /property-requests/my-requests/:id
}

export interface UserSearchFeedback {
  id: number;
  rooms: number | null;
  bathrooms: number | null;
  zone: string | null;
  localidad: string | null;
  barrio: string | null;
  priceMin: string | null; // columna decimal → string
  priceMax: string | null;
  propertyType: 'casa' | 'departamento' | 'terreno' | 'local' | 'oficina' | null;
  operationType: 'alquiler' | 'venta' | null;
  antiquityMax: number | null;
  hasGarage: boolean | null;
  hasPatio: boolean | null;
  notes: string | null;
  deviceId: string;
  createdAt: string;
}

// ============================================================
// AUTH — REQUESTS Y RESPONSES
// ============================================================

export interface RegisterDto {
  name: string;
  surname: string;
  phone: string;
  photo?: string;
  email: string;
  password: string; // min 5 chars
}

export interface LoginDto {
  email: string;
  password: string; // min 5 chars
}

export interface GoogleLoginDto {
  idToken: string;
}

export type RegisterResponse = User;

export interface LoginResponse {
  message: string;
  user: User;
}

export type GoogleLoginResponse = LoginResponse;

export type GetMeResponse = User;

export interface LogoutResponse {
  message: string;
}

// ============================================================
// USERS — DTOs
// ============================================================

export interface CreateUserDto {
  name: string;
  surname: string;
  phone: string;
  photo?: string;
  email: string;
  password: string; // min 5 chars
}

export interface UpdateUserDto {
  name?: string;
  surname?: string;
  phone?: string;
  photo?: string;
  email?: string;
  password?: string; // SIN mínimo de largo acá
  notifyBroadcast?: boolean;
}

// ============================================================
// PROPERTIES — DTOs
// ============================================================

export interface CreatePropertyDto {
  title: string;
  description: string;
  typeOfPropertyId: number;
  operationType: OperationType;
  property_deed: boolean;
  tractoAbreviado: boolean;
  boleto: boolean;
  provincia: string;
  localidad: string;
  barrio: string;
  direccion: string;
  zone: string;
  rooms: number;
  bathrooms: number;
  garage: boolean;
  patio: boolean;
  supTotal: number;
  supCubierta: number;
  antiquity: number;
  price: number;
  status: StatusProperty;
}

export type UpdatePropertyDto = Partial<CreatePropertyDto> & {
  deleteImages?: number[];
  setCoverImageId?: number;
};

export interface PropertyFilterDto {
  page?: number;
  limit?: number;
  title?: string;
  zone?: string;
  rooms?: number;
  bathrooms?: number;
  typeOfPropertyId?: number;
  minPrice?: number;
  maxPrice?: number;
  minSupTotal?: number;
  maxSupTotal?: number;
  minSupCubierta?: number;
  maxSupCubierta?: number;
  maxAntiquity?: number;
  garage?: 'true' | 'false';
  patio?: 'true' | 'false';
  property_deed?: 'true' | 'false';
  tractoAbreviado?: 'true' | 'false';
  boleto?: 'true' | 'false';
  status?: StatusProperty;
  provincia?: string;
  localidad?: string;
  operationType?: OperationType;
  barrio?: string;
  direccion?: string;
  search?: string;
}

export interface PropertyFilterResponse {
  data: Property[];
  meta: { totalItems: number; itemCount: number; totalPages: number; currentPage: number };
}

// ============================================================
// PROPERTY REQUEST — DTOs
// ============================================================

export interface CreateRequestPropertyDto {
  localidad: string;
  barrio: string;
  direccion: string;
  pisoDepto?: string;
  tipoPropiedad: TipoPropiedadRequest;
  tipoOperacion: TipoOperacionRequest;
  estadoConservacion: EstadoConservacionRequest;
  m2Totales: number;
  m2Cubiertos: number;
  habitaciones: number;
  baños: number;
  antiguedad: number;
  orientacion?: string;
  patio: boolean;
  garage: boolean;
  escritura: boolean;
  impuestosAlDia: boolean;
  aptoCredito: boolean;
  precioEstimado: number;
  mensajeAgente?: string;
}

export interface UpdateRequestStatusDto {
  status: RequestStatus;
}

// ============================================================
// OTROS DTOs relevantes
// ============================================================

export interface CreateRatingDto {
  score: number; // 1-5
}

export interface CreateCommentDto {
  message: string; // max 500 chars
}
export type UpdateCommentDto = Partial<CreateCommentDto>;

export interface CreateSearchPreferenceDto {
  zone?: string;
  localidad?: string;
  barrio?: string;
  garage?: boolean;
  patio?: boolean;
  operationType?: OperationType;
  property_deed?: boolean;
  tractoAbreviado?: boolean;
  boleto?: boolean;
  typeOfPropertyId?: number;
  preferredPrice?: number;
  minRooms?: number;
  minBathrooms?: number;
  supTotal?: number;
  supCubierta?: number;
  maxAntiquity?: number;
  notifyNewMatches?: boolean;
  notifyPriceDrops?: boolean;
}
export type UpdateSearchPreferenceDto = Partial<CreateSearchPreferenceDto>;

export interface CreateTypeOfPropertyDto {
  name: string; // min 3 chars
}
export type UpdateTypeOfPropertyDto = Partial<CreateTypeOfPropertyDto>;

// ============================================================
// ERRORES
// ============================================================

/** Shape de NotFoundException/ConflictException/ForbiddenException/UnauthorizedException/BadGatewayException/InternalServerErrorException y BadRequestException con un solo mensaje string */
export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error: string; // "Bad Request" | "Unauthorized" | "Forbidden" | "Not Found" | "Conflict" | "Bad Gateway" | "Internal Server Error"
}

/** Shape cuando falla class-validator (ValidationPipe global o JsonToDtoPipe) */
export interface ApiValidationErrorResponse {
  statusCode: 400;
  message: string[]; // uno o más mensajes de constraint
  error: 'Bad Request';
}

/** Shape del 429 por rate limit — sin campo `error` */
export interface ApiThrottleErrorResponse {
  statusCode: 429;
  message: 'ThrottlerException: Too Many Requests';
}
```
