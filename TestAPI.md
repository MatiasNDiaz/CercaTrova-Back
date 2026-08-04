# TestAPI — Auditoría pre-despliegue (backend)

> Auditoría: 2026-08-02 · **Correcciones aplicadas: 2026-08-03** · **Decisiones cerradas: 2026-08-04**
>
> Auditoría original sobre el código ya hardened (SECURITY_FIXES.md,
> SECURITY_FIXES_2.md, FEATURES.md, ERROR_FIXES.md).
> Método: revisión de código + build/lint/test + **servidor real levantado contra la DB
> de desarrollo** con una batería de ~120 requests HTTP reales (auth, guards, filtros,
> posts, tracking, statistics, property-requests, notificaciones).
> Los usuarios y filas de prueba creados durante la corrida fueron eliminados al final.

---

## 📌 ESTADO AL 2026-08-04

Los **5 bloqueantes 🔴 están resueltos y verificados en vivo**, junto con los 3
puntos de coordinación pedidos por el frontend y los 7 🟡 de alto impacto.

**2026-08-04 — las 3 decisiones pendientes quedaron cerradas:**
1. Guards de favoritos/ratings/search-preferences restringidos a `Role.USER`:
   **confirmado como comportamiento correcto, sin cambios de código.**
2. Migración `UniqueSearchPreferencePerUser`: se le agregó una salvaguarda de
   auditoría (log + tabla de respaldo) antes del `DELETE`, para el día que se
   corra en producción con datos reales. No se re-ejecutó en desarrollo (0
   duplicados, ya confirmado).
3. Transporte de email (Gmail SMTP / SendGrid): **sigue como decisión de
   negocio pendiente**, sin acción de código.

*(La numeración es la de las secciones de este documento.)*

| # | Hallazgo | Estado |
|---|---|---|
| 🔴 1 | Hash bcrypt en la respuesta de `PATCH /users/*` | ✅ Resuelto |
| 🔴 2 | Migración base faltante | ✅ Resuelto |
| 🔴 3 | `ADMIN_PASSWORD` de 6 caracteres | ✅ Resuelto — era **configuración**, no código |
| 🔴 4 | `FRONTEND_URL` / `NODE_ENV` sin definir | ✅ Resuelto — era **configuración**, no código |
| 🔴 5 | Ocultar la única respuesta borraba el comentario padre | ✅ Resuelto |
| 🟡 6 | Guards decorativos (`@Roles` sin `RolesGuard`) | ✅ Resuelto — comportamiento **confirmado correcto** |
| 🟡 7 | `search-preferences` duplicadas → emails repetidos | ✅ Resuelto |
| 🟡 8 | `User` completo del agente en respuestas públicas | ✅ Resuelto |
| 🟡 9 | `GET /users/:id` expone el perfil de cualquiera | ⬜ **Abierto** (no estaba en el pedido) |
| 🟡 10 | Índices faltantes en las FK | ✅ Resuelto |
| 🟡 11 | `GET /properties` con N+1 y sin paginación | ✅ Resuelto ⚠️ *cambio de contrato* |
| 🟡 12 | `GET /statistics` carga tablas enteras en memoria | ⬜ **Abierto** (no estaba en el pedido) |
| 🟡 13 | `GET /posts/:id/comments` sin `OptionalJwtAuthGuard` | ✅ Resuelto |
| 🟡 14 | `:id` no numérico → 500 en propiedades | ⬜ **Abierto** (no estaba en el pedido) |
| 🟡 15 | `POST /users`: registro sin rate limit estricto | ⬜ **Abierto** (no estaba en el pedido) |
| 🟡 16 | Gmail SMTP como transporte masivo | 📋 **Decisión de negocio** — ver nota |
| 🟡 17 | `PropertyFilterDto.title` placebo | ✅ Resuelto |
| 🟡 18 | 2 enums muertos | ✅ Resuelto |

**Pedidos extra del frontend, además de los hallazgos:** `ratingAverage` en
`GET /properties/filter` ✅ · campo `type` en `Notification` ✅.

**Quedan 4 🟡 abiertos** (9, 12, 14, 15) porque no estaban en el pedido de esta
tanda. Ninguno bloquea el despliegue; el más relevante es el **9** (cualquier
usuario logueado lee el email y el teléfono de cualquier otro).

**Verificación final (2026-08-03):** `npm run build` limpio · `npm test` **14/14 PASS** ·
`migration:run` sobre una base Postgres vacía real **termina sin error** y el schema
resultante coincide **exactamente** con las entidades (193 columnas, 38 índices,
cero diferencias).

⚠️ **Dos cambios que el frontend tiene que acompañar** — ver la sección
"Cambios de contrato" al final.

⚠️ **Tres migraciones tocan DATOS existentes**, no solo schema — ver
"Migraciones de datos" al final.

---

## 🔧 CORRECCIONES APLICADAS (2026-08-03)

Detalle de qué se cambió por cada hallazgo. Los números son los de las secciones
de más abajo, donde está el diagnóstico completo.

### 🔴 1 — Hash bcrypt en la respuesta
`src/modules/users/users.service.ts` · `updateUser()` ahora hace
`delete saved.password` antes del `return`, igual que `createUser()`. Se agregó
el mismo `delete` defensivo en `updateProfilePhoto()`.
**Se auditaron los 6 return paths de `UsersService`:** los tres `save()` borran
el hash y los otros tres nunca lo cargan (`select: false`);
`findUserByEmailWithPassword()` sigue siendo la única excepción y solo la usa el
login.
**Verificado en vivo:** `PATCH /users/me {password}` → 200 sin campo `password`;
`PATCH /users/:id {password}` como admin → 200 sin el hash del otro usuario; el
cambio de password sigue revocando la sesión (token viejo → 401).

### 🔴 2 — Migración base
Como el proyecto **nunca fue desplegado**, el historial de migraciones no tenía
valor: se hizo **squash**. Las 4 incrementales se movieron a
`src/migrations/_archivo_pre_baseline/` (fuera del glob de TypeORM, con un
README que explica el porqué — **no se borró nada**) y se generó
`1785731109084-InitialSchema.ts`, que crea las 18 tablas desde cero.
**Verificado de verdad:** se creó una base Postgres vacía real, se corrió
`migration:run` y terminó sin error; el schema resultante se comparó columna por
columna contra la base de desarrollo → **193 columnas y 38 índices idénticos,
cero diferencias**. La base de desarrollo quedó reconciliada (`migration:show`
muestra todo aplicado, nada pendiente). La base temporal se eliminó al terminar.

### 🔴 3 y 🔴 4 — Variables de entorno *(no eran bugs de código)*
`.env`: `ADMIN_PASSWORD` pasó de 6 a **24 caracteres**, y se agregaron
`NODE_ENV=development`, `FRONTEND_URL=http://localhost:3001` y `PORT=3000`.
`.env.example` ahora documenta explícitamente el mínimo de 12 caracteres del
admin y **de qué depende `NODE_ENV`** (el `synchronize: false` de TypeORM y el
flag `secure` de la cookie de sesión).
**Verificado:** la app arranca limpio contra una base **nueva** con
`NODE_ENV=production` — crea la extensión `unaccent`, crea el admin (ahora pasa
la validación de fortaleza) y levanta sin errores.

> ⚠️ El admin que ya existe en la base de desarrollo **conserva su password
> anterior**: `createDefaultAdmin()` solo usa `ADMIN_PASSWORD` cuando crea el
> usuario, nunca lo actualiza. El valor nuevo del `.env` aplica al primer
> arranque de un ambiente nuevo. Si querés que coincidan en desarrollo, hay que
> cambiarlo desde la app.

### 🔴 5 — El comentario padre desaparecía
`src/modules/posts/posts.service.ts` · `findComments()`. La condición
`(reply.id IS NULL OR reply.isHidden = false)` estaba en el **WHERE**; pasó al
**ON** del `leftJoinAndSelect`. Así, cuando todas las respuestas están ocultas,
el comentario raíz se devuelve igual con `replies: []` en vez de desaparecer.
**Verificado con el mismo caso de reproducción del audit**, más un caso mixto:
padre + 1 respuesta oculta → padre visible con `replies: 0`; padre + 1 oculta +
1 visible → padre visible con `replies: 1`; el texto oculto no se filtra al
público.

### 🟡 6 — Guards decorativos
`RolesGuard` agregado donde había `@Roles` sin él: `favorites.controller.ts`
(nivel de clase), `POST /ratings/:propertyId` y `search-preferences.controller.ts`
(nivel de clase). En search-preferences además se cambió `AuthGuard('jwt')` por
`JwtAuthGuard` (el guard del proyecto, el único que respeta `@Public()`) y se
quitó el `@UseGuards(RolesGuard)` duplicado de la ruta admin. De paso,
`ratings.rate()` pasó de `@Req()` a `@GetUser('id')`, la convención del repo.
**Verificado:** el ADMIN ahora recibe **403** en `GET /favorites`,
`POST /favorites/:id`, `POST /ratings/:id` y `POST /search-preferences`; el USER
sigue entrando normalmente y `GET /search-preferences/user/:id` sigue siendo
solo-admin.

**Decisión confirmada (2026-08-04):** este bloqueo se queda tal cual — **no es
un bug, es el comportamiento correcto.** Un admin no necesita
favoritear/valorar/guardar preferencias de búsqueda desde su propia cuenta de
gestión; son acciones de la experiencia de comprador, no de administración. No
se toca más código de esto — si el panel admin en algún momento reutilizaba
componentes de favoritos/ratings pensados para usuarios, esos componentes no
deberían montarse en una sesión de admin.

### 🟡 7 — Preferencias duplicadas
`search-preferences.service.ts` · `create()` es ahora un **upsert**: si el
usuario ya tiene preferencia, delega en `update()`. Se agregó además el índice
único `@Index(['user'], { unique: true })` en la entidad, que es la garantía
real contra dos requests simultáneas.
**Verificado:** 3 POST seguidos → siempre `id=8`, con los datos del último; el
GET devuelve uno solo.

### 🟡 8 y 🟡 14 — Datos sensibles en respuestas públicas
`properties.service.ts`: nueva constante `AGENT_PUBLIC_FIELDS`
(`id, name, surname, phone, photo`) aplicada con `leftJoin` + `addSelect` en
`findAll()`, `findOne()` y `filter()`, en vez de cargar la relación `agent`
entera. **El `email` queda afuera a propósito** (el contacto va por teléfono y
formulario; no hace falta exponerlo al scraping). Lo mismo para `referredBy`,
que también es un `User`. Y `findOne()` **ya no devuelve la lista `favorites`**
—que exponía los `user_id` de quiénes marcaron la propiedad— sino
`favoritesCount`.
**Verificado sin sesión:** el agente llega como
`{id, name, surname, phone, photo}`; ya no viajan `email`, `tokenVersion`,
`notifyBroadcast`, `profileIncomplete`, `authProvider` ni `role`.

### 🟡 10 — Índices de claves foráneas
`@Index` declarado en las entidades (para que el schema siga saliendo de ahí) +
migración `1785732291219-AddForeignKeyIndexes.ts` con **10 índices**:
`notifications(userId,targetRole)` y `(targetRole,read)` — la campanita
consultaba cada 60 s sin índice—, `property(status,created_at)`,
`comments(userId)` y `(propertyId)`, `ratings(propertyId)`,
`favorites(property_id)`, `property_images(propertyId)`,
`post_comments(postId)` y `(parentCommentId)`.
No se indexaron `ratings.userId` ni `favorites.user_id`: ya quedan cubiertos como
prefijo del UNIQUE y de la PK compuesta.
**Verificado en la base:** los 10 índices existen.

### 🟡 11 — N+1 y paginación en `GET /properties`
Nuevo helper `withRatingAverage()` que resuelve el promedio de toda la página
con **una sola query** (`GROUP BY`), en reemplazo de la subconsulta `AVG` por
propiedad dentro de un `Promise.all`. `findAll()` ahora acepta `?page` y
`?limit` (`PropertyPaginationDto`, máx. 100) y devuelve `{ data, meta }`.
**Verificado:** de **510 ms → 9 ms**; `?limit=999` → 400.
**Ver "Cambios de contrato" — la forma de la respuesta cambió.**

### 🟡 13 — El admin no veía los comentarios ocultos
`posts.controller.ts` · se agregó `@UseGuards(OptionalJwtAuthGuard)` a
`GET /posts/:id/comments`, igual que ya tenían `GET /posts` y `GET /posts/:id`.
**Verificado:** el admin logueado ahora sí recibe los comentarios ocultos (puede
revertirlos) y un USER común sigue sin verlos.

### 🟡 17 — `title` placebo
Eliminado de `PropertyFilterDto`. La búsqueda por título ya la cubre `?search=`,
que incluye `p.title`. **Verificado:** `?title=x` ahora responde **400**
("property title should not exist") en vez de aceptarlo y no filtrar.

### 🟡 18 — Enums muertos
Eliminados `src/modules/requests/dto/enumsRequest.ts` y
`src/modules/search-preferences/dto/enumTypeOfProperty.ts`, más el import muerto
en `search-preference.entity.ts`. Verificado con grep (cero referencias) y con
`npm run build`.

### 🤝 Pedidos del frontend

**`ratingAverage` en `GET /properties/filter`** — agregado vía el mismo helper
`withRatingAverage()` (una query extra por página, no una por propiedad).
Verificado: el campo llega en cada item.

**Campo `type` en `Notification`** — nuevo enum `NotificationType`
(`src/modules/notifications/enums/notification-type.enum.ts`) con **12 valores
más un fallback**, derivados de los generadores reales:

| Feed del usuario | Feed del admin |
|---|---|
| `propiedad_match` · `nueva_propiedad` · `cambio_precio` · `nueva_publicacion` · `respuesta_comentario` · `estado_solicitud` | `admin_nuevo_usuario` · `admin_nuevo_comentario` · `admin_nueva_valoracion` · `admin_nueva_solicitud` · `admin_nuevo_favorito` · `admin_comentario_publicacion` |

Columna `varchar` (no enum de Postgres) para que agregar un tipo no exija un
`ALTER TYPE` — mismo criterio que `targetRole`. En
`createAdminNotification()` el `type` es el **primer parámetro y es obligatorio**,
así el compilador fuerza a clasificar cualquier notificación de admin nueva.
Se completó en los **12 puntos de creación**.
**Verificado:** las 355 notificaciones existentes quedaron reclasificadas por el
backfill (**cero en `generica`**) y las nuevas nacen con su tipo
(`admin_nueva_valoracion`, etc.).

---

## ✅ FUNCIONA CORRECTAMENTE Y ESTÁ LISTO

### Verificación técnica
- **`npm run build`** → compila limpio (exit 0).
- **`npm test`** → 3 suites / **14 tests PASS** (guards + autorización). Siguen vigentes.
- **`npx eslint "src/**/*.ts"`** → 1379 problemas al momento de la auditoría; **1561 tras las correcciones** (1366 de formato `prettier/prettier`, auto-corregibles, + 195 de tipado `no-unsafe-*`/`no-unused-vars` — exactamente los mismos 195 de antes). Es el backlog conocido de B4: **el aumento es solo indentación del código agregado, ninguna categoría nueva**. Nada bloqueante.
- **Arranque** → la app levanta contra el `.env` real sin errores, mapea todas las rutas, `unaccent` verificada, admin ya existente.

### Seguridad re-confirmada contra el código y en vivo
- **Helmet activo**: `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`, `strict-transport-security`, `referrer-policy: no-referrer`, y `x-powered-by` **removido**.
- **CORS restringido**: con `Origin: https://sitio-malicioso.com` la respuesta sigue devolviendo `access-control-allow-origin: http://localhost:3001` → el navegador bloquea. No hay `*` ni reflejo del origin. `credentials: true` correcto.
- **Rate limiting global**: 115 requests seguidas → 97×200 + **18×429**. Funciona.
- **Rate limiting de credenciales**: 8 intentos de login → 5×401 + **3×429**. `@Throttle(5/min)` sigue en `/auth/login`, `/auth/register` y `/auth/google`.
- **`JwtStrategy.validate()`** consulta la DB en cada request, toma el `role` de la DB y compara `tokenVersion`. Verificado en vivo: tras `PATCH /users/me {password}` el token viejo pasa a **401** inmediatamente. Igual tras logout.
- **`synchronize: NODE_ENV !== 'production'`** intacto en `typeorm.config.ts`, y `data-source.ts` lo fuerza a `false` para la CLI.
- **Ningún secreto en logs**: grep completo de `console.*` — 21 ocurrencias, todas son mensajes de error de notificaciones/emails. Ninguna imprime password, API key, token ni secret. Los logs de `EmailService` muestran solo destinatario y transporte.
- **Passwords nunca salen en**: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `GET /users` (14 usuarios, ninguno con `password`). El `select: false` de la entidad sigue haciendo su trabajo.

### Módulos nuevos auditados por primera vez
- **`statistics/` — correcto.** Guards `JwtAuthGuard + RolesGuard` y `@Roles(ADMIN)` **a nivel de clase**, que es el patrón más seguro (ninguna ruta nueva puede quedar abierta por olvido). Verificado en vivo: sin sesión → **401**, como USER → **403**, como ADMIN → **200**. Los 12 endpoints responden 200 con `?range=day|week|month`, y `?range=siglo` → **400** con la lista de valores permitidos. `StatisticsQueryDto` valida con `@IsEnum`. No hay interpolación de input en SQL (el único `${columna}` de `ownInventory` recibe literales hardcodeados). Los rankings sin fecha declaran honestamente `rangeApplies: false`.
- **`tracking/` — correcto en lo esencial.** Público a propósito, con `@Throttle(120/min)` propio. DTOs validados: campo extra → 400, `path` > 300 chars → 400, `durationMs` negativo → 400. `recordDuration` exige que la fila pertenezca **al mismo `visitorId`** (no se pueden escribir duraciones en visitas ajenas). La cookie `ct_vid` es `httpOnly` + `sameSite: lax` + `secure` en producción, y contiene solo un UUID opaco (sin dato personal). El servicio nunca puede romper la request que lo dispara: todos los métodos capturan y solo loguean — **verificado en vivo** (un `propertyId` NaN generó el error en el log de tracking y la request del usuario igual respondió).
- **`posts/` — guards correctos.** `JwtAuthGuard + RolesGuard` a nivel de clase con `@Public()` puntual. Verificado: crear/borrar publicación como USER → **403**; like sin sesión → **401**; like es idempotente y transaccional (`{liked:true,likesCount:1}` → `{liked:false,likesCount:0}`). Las respuestas exponen solo `USER_PUBLIC_FIELDS` del autor (`id,name,surname,photo,role`) — nunca el `User` completo. El rollback de Cloudinary ante fallo de DB está implementado.

### Flujos de negocio probados end-to-end
- **Auth**: registro → login (cookie httpOnly) → `/auth/me` → logout → token viejo 401. ✅
- **Comentarios de propiedad**: crear, editar el propio (200), **editar el ajeno → 403**, borrar como admin (200), listar público. ✅
- **Ratings**: `score=9` → 400; `score=5` → 201; re-valorar actualiza sin duplicar; property inexistente → **404**; `GET /ratings/mine` ok. ✅
- **Favoritos**: alta, duplicado → **409**, listado, borrado individual, `DELETE /favorites/all` (la ruta literal resuelve antes que `:propertyId`), sin sesión → 401. ✅
- **PropertyRequest**: alta 201 (`status: enviado`); `habitaciones: -1` → 400; `tipoPropiedad: "Castillo"` → 400; **`enviado → en_revision` 200**, **`en_revision → enviado` 409**, **`en_revision → aceptado` 200**, **`aceptado → rechazado` 409 (terminal)**, status inexistente → 400; cambiar estado como USER → 403; `GET /my-requests/:id` de otro usuario → **403**. ✅ El ciclo de vida está correctamente blindado.
- **Notificaciones**: se generan (in-app) en favoritos/comentarios/ratings/solicitudes; `unread-count` responde; marcar como leída una notificación ajena → **404**; `/notifications/admin` como USER → 403. ✅
- **Email**: transporte activo = **SMTP (Gmail)**. Durante toda la auditoría: **0 fallos**, log `✅ Enviado ... vía SMTP (intento 1)`. El sistema de reintentos + `failed_emails` está probado en datos reales: 77 filas históricas, todas con `"Maximum credits exceeded"` de SendGrid entre el 22 y el 29 de julio — capturó el 100% de los fallos, exactamente como fue diseñado. ✅
- **Filtros**: `?localidad=` (unaccent ILIKE), `?search="casa con patio"` (NLP), combinación `minPrice+maxPrice+rooms+garage`, `?sortBy=rating` (subconsulta AVG), `/properties/filters/locations`. Todos 200. `?status=inventado` → **400** con valores permitidos; `?campoQueNoExiste=1` → **400** (`forbidNonWhitelisted` activo en query params). ✅
- **Guards admin/user**: `POST /property-types` como USER → 403; `DELETE /property-images/:id` como USER → 403; `GET /property-images/:id` sin sesión → 401; `GET /search-preferences/user/1` como USER → 403 / como ADMIN → 200; `GET /users` como USER → 403; `GET /stats/*` sin sesión → 401. ✅

### Infraestructura de despliegue ya resuelta
- **Existe infraestructura de migraciones** (contradice lo documentado en SECURITY_FIXES_2.md M10, que quedó desactualizado): `src/config/data-source.ts`, scripts `migration:generate|run|revert|show` en `package.json`, y 4 migraciones aplicadas en la DB actual. *(Ver 🔴 #4: falta la migración base.)*
- **Índices correctos en las tablas nuevas de tracking**: `page_visits(createdAt)`, `page_visits(visitorId,createdAt)`, `property_views(createdAt)`, `property_views(propertyId,createdAt)`, `filter_usages(createdAt)`. Son justo las columnas que consulta el dashboard.
- **`users.email` indexado** (constraint UNIQUE).
- **Extensión `unaccent` instalada** y verificada en cada boot.
- **`.env.example` completo y al día**: incluye las variables nuevas de SMTP, `EMAIL_FROM`, `FRONTEND_URL`, `PORT`, `NODE_ENV`. Ninguna variable usada por el código falta del ejemplo.

---

## 🔴 RIESGO — URGENTE ANTES DE DESPLEGAR

### 1. ✅ RESUELTO — `PATCH /users/me` y `PATCH /users/:id` devolvían el hash bcrypt
- **Dónde**: `src/modules/users/users.service.ts:133-165` (`updateUser`), expuesto por `users.controller.ts:65` y `users.controller.ts:83`.
- **Qué pasa**: `ensureExists()` carga el usuario **sin** password (por el `select: false`). Después `updateUserDto.password = await bcrypt.hash(...)` y `Object.assign(user, updateUserDto)` **le inyectan el hash al objeto**, y `save()` lo devuelve. A diferencia de `createUser()`, acá **no hay `delete saved.password`**.
- **Verificado en vivo**:
  - `PATCH /users/me {password}` → `200` con `"password": "$2b$10$.Sz39pvUfBeD5..."`
  - `PATCH /users/:id {password}` como ADMIN → `200` con **el hash del OTRO usuario**: `"$2b$10$hJx9FFiAoNv71..."`
- **Por qué importa**: es una regresión directa del hardening C2/C8, que existió justamente para que ningún hash saliera nunca de la API. El caso admin es el grave: el administrador recibe por HTTP material de cracking offline de la contraseña de un tercero, y ese JSON queda en el estado del frontend, en logs de proxy/CDN y en el historial de red del navegador.
- **Solución**: en `updateUser()`, antes del `return`, replicar lo que ya hace `createUser()`:
  ```ts
  const saved = await this.userRepository.save(user);
  delete saved.password;   // ← nunca devolver el hash
  return saved;
  ```

### 2. ✅ RESUELTO — faltaba la migración base
- **Dónde**: `src/migrations/` (4 archivos) + `src/config/typeorm.config.ts:43`.
- **Qué pasa**: las 4 migraciones son **incrementales**. La primera empieza con `ALTER TABLE "property" RENAME COLUMN "m2" TO "supTotal"` y `ALTER TABLE "search_preferences" ...`, o sea **asume que las tablas core ya existen**. Existen en desarrollo porque las creó `synchronize`. En una DB productiva nueva con `NODE_ENV=production` (que desactiva `synchronize`), `npm run migration:run` **falla en la primera sentencia**: no hay `property`, `users`, `comments`, etc.
- **Confirmado**: en la DB actual la tabla `migrations` registra las 4 corridas, pero el schema base nació de `synchronize`, no de una migración.
- **Por qué importa**: bloquea literalmente el primer despliegue. La app arranca, no encuentra tablas y todo responde 500.
- **Solución**: generar una migración **base** que preceda a las 4 actuales, contra una base vacía:
  ```bash
  # con una DB vacía apuntada en el .env y las 4 migraciones movidas temporalmente
  npm run migration:generate -- src/migrations/InitialSchema
  ```
  y verificar el ciclo completo en una base limpia: `migration:run` → `NODE_ENV=production npm run start:prod` → smoke test. Alternativamente, una única migración base que refleje el estado actual completo y marcar las 4 viejas como ya aplicadas.

### 3. ✅ RESUELTO (configuración) — `ADMIN_PASSWORD` de 6 caracteres
- **Dónde**: `src/common/bootstraps/bootstrap.service.ts:905` + `.env`.
- **Qué pasa**: `createDefaultAdmin()` lanza y **aborta el arranque** si `ADMIN_PASSWORD` < 12 caracteres **y el admin todavía no existe**. En la DB actual el admin ya existe, así que el chequeo no se ejecuta y el problema está oculto. En producción (base nueva) la app **no arranca**.
- **Por qué importa**: segundo bloqueante del primer deploy, y además esa contraseña de 6 caracteres es la de la cuenta con más privilegios del sistema.
- **Solución**: definir un `ADMIN_PASSWORD` fuerte (≥12 caracteres) en el `.env` de producción **antes** del primer arranque, y rotar también el de desarrollo.

### 4. ✅ RESUELTO (configuración) — `FRONTEND_URL` y `NODE_ENV` sin definir
- **Dónde**: `src/main.ts:19` + `.env` (la variable existe en `.env.example` pero **no** en el `.env` real).
- **Qué pasa**: sin la variable, el origin cae al fallback `http://localhost:3001`. Verificado en vivo: el header devuelto es siempre `http://localhost:3001`.
- **Por qué importa**: con el frontend en su dominio real, **todas** las requests con cookie fallan por CORS. La app "anda" pero la web entera no funciona, y el síntoma en el navegador no señala al backend.
- **Solución**: definir `FRONTEND_URL` con el/los origins productivos (separados por coma) antes de deployar. Definir también `NODE_ENV=production` — de ella dependen `synchronize: false` **y** el `secure: true` de la cookie de sesión (`auth-cookie.helper.ts`). Sin `NODE_ENV=production`, la cookie de sesión viaja **sin el flag `secure`**.

### 5. ✅ RESUELTO — ocultar la única respuesta hacía desaparecer el comentario padre
- **Dónde**: `src/modules/posts/posts.service.ts:270-275` (`findComments`).
- **Qué pasa**: con `includeHidden = false` se agrega `qb.andWhere('(reply.id IS NULL OR reply.isHidden = false)')`. El comentario del código dice que la condición "va en el ON, no en el WHERE", pero `andWhere` la pone en el **WHERE**. Si un comentario raíz tiene respuestas y **todas** están ocultas, todas sus filas del LEFT JOIN se descartan y **el comentario raíz desaparece del listado público**.
- **Verificado en vivo (repro aislada)**: comentario padre + 1 respuesta → el público ve 2 raíces; se oculta la única respuesta → el público ve **1**, el padre desapareció.
- **Por qué importa**: moderar una respuesta borra de la vista el comentario legítimo de otro usuario, sin que nadie lo haya pedido ni lo note. Es pérdida silenciosa de contenido de usuarios en el feed público.
- **Solución**: mover la condición de la respuesta al `ON` del join, que es lo que el propio comentario del código pretendía:
  ```ts
  .leftJoinAndSelect('comment.replies', 'reply', includeHidden ? undefined : 'reply.isHidden = false')
  ```
  y dejar en el `WHERE` únicamente `comment.isHidden = false`.

---

## 🟡 MEJORA RECOMENDADA

### 6. ✅ RESUELTO — `@Roles(Role.USER)` sin `RolesGuard`, decorador inerte en 3 controladores
- **Dónde**: `src/modules/favorites/favorites.controller.ts` (las 4 rutas), `src/modules/ratings/ratings.controller.ts:14` (`POST /ratings/:propertyId`), `src/modules/search-preferences/search-preferences.controller.ts:15` (`POST /search-preferences`).
- **Verificado en vivo**: como ADMIN → `GET /favorites` **200**, `POST /favorites/:id` **201**, `POST /ratings/:id` **201**, `POST /search-preferences` **201**. El `@Roles(USER)` no aplica nada.
- **Por qué importaba**: hoy **no había brecha de acceso** — el admin solo opera sobre sus propios recursos (el `userId` sale del token) y que un admin marque un favorito era inocuo. El riesgo real era el patrón: es exactamente la clase de defecto que causó C3, C4 y C6, y el día que alguien agregara un `@Roles(Role.ADMIN)` a una ruta de estos controladores no habría protegido nada. Además `search-preferences.controller.ts` usaba `AuthGuard('jwt')` directo en vez de `JwtAuthGuard`, rompiendo la convención del repo.
- **Solución aplicada**: se agregó `RolesGuard` en los 3 controladores (se unificó también `AuthGuard('jwt')` → `JwtAuthGuard`).
- **Decisión confirmada (2026-08-04)**: el bloqueo resultante para el ADMIN se mantiene tal cual — **no es un bug**. Un admin no necesita favoritear, valorar ni guardar preferencias de búsqueda desde su cuenta de gestión; son acciones de la experiencia de comprador. Sin cambios de código pendientes acá.

### 7. ✅ RESUELTO — `POST /search-preferences` repetido duplicaba filas → emails repetidos
- **Dónde**: `src/modules/search-preferences/search-preferences.service.ts:29-59` (`create`), consumido por `notifications.service.ts:62` (`findAllWithUsers()`).
- **Verificado en vivo**: 3 POST seguidos del mismo usuario → 3 filas (`id=5,6,7`). `GET /search-preferences` usa `findOne` y devuelve **solo la primera** (`id=5`) — el usuario ni se entera de las otras dos.
- **Por qué importa**: no es solo suciedad de datos. `handleNewProperty()` recorre **todas** las filas de `findAllWithUsers()`, así que un usuario con 3 preferencias duplicadas recibe **3 notificaciones in-app y 3 emails idénticos** por cada propiedad nueva que matchee. Un usuario que toque "Guardar" cinco veces se auto-inscribe a 5× spam, y no tiene forma de deshacerlo desde la UI (el GET solo le muestra una).
- **Solución**: convertir `create()` en upsert — si `getByUser(userId)` devuelve algo, delegar en `update()`. Complementar con un índice único en DB (`@Index(['user'], { unique: true })` sobre `SearchPreference`) y limpiar los duplicados existentes en una migración de datos.

### 8. ✅ RESUELTO — endpoints públicos exponían el `User` completo del agente
- **Dónde**: `src/modules/properties/properties.service.ts:82-93` (`findOne`, `relations: ['agent', ...]`) y `properties.service.ts:371` (`filter`, `leftJoinAndSelect('p.agent','agent')`).
- **Verificado en vivo, sin sesión**:
  ```json
  "agent": { "id":1, "name":"Edgar", "phone":"3515067576", "email":"edgardiaz@gmail.com",
             "profileIncomplete":false, "role":"admin", "authProvider":"local",
             "notifyBroadcast":true, "tokenVersion":42, "createdAt":"...", "updatedAt":"..." }
  ```
  `GET /properties/:id` además devuelve `favorites: [{"user_id":7,...},{"user_id":1,...}]` y `ratings` con `userId` — o sea **qué usuarios marcaron favorita o valoraron cada propiedad**, en abierto.
- **Por qué importa**: el email y teléfono del agente pueden ser deliberadamente públicos, pero `tokenVersion`, `notifyBroadcast`, `profileIncomplete` y `authProvider` son estado interno y no deberían salir nunca; `tokenVersion` revela cuántas veces se cerró sesión / cambió la contraseña. Los `user_id` de favoritos son comportamiento de usuarios expuesto a cualquiera. Es incoherente con el patrón `USER_PUBLIC_FIELDS` que el módulo `posts` ya aplica bien.
- **Solución**: reemplazar `leftJoinAndSelect`/`relations` del agente por el patrón de `posts.service.ts`:
  ```ts
  .leftJoin('p.agent', 'agent')
  .addSelect(['agent.id','agent.name','agent.surname','agent.phone','agent.email','agent.photo'])
  ```
  y sacar `favorites` de las relaciones de `findOne()` (o devolver solo el conteo).

### 9. ⬜ ABIERTO — `GET /users/:id` deja que cualquier logueado lea el perfil de cualquier otro
- **Dónde**: `src/modules/users/users.controller.ts:56-60` — solo `@UseGuards(JwtAuthGuard)`, sin chequeo de ownership ni de rol.
- **Verificado en vivo**: un USER recién registrado consultó `GET /users/1` y recibió `id,name,surname,phone,photo,email,profileIncomplete,role,authProvider,notifyBroadcast,tokenVersion,createdAt,updatedAt`.
- **Por qué importa**: con una cuenta gratuita cualquiera enumera `/users/1..N` y se lleva el padrón completo de emails y teléfonos de la plataforma. Es el mismo tipo de exposición que motivó C6 (preferencias de terceros), que sí se corrigió.
- **Solución**: aplicar el criterio que ya usa `PATCH /users/:id` — permitir solo si `req.user.id === Number(id)` o `req.user.role === ADMIN`; si no, 403. Alternativamente, devolver una proyección pública reducida cuando el solicitante no es ni el dueño ni admin.

### 10. ✅ RESUELTO — faltaban índices en las claves foráneas
- **Dónde**: schema real (verificado con `pg_indexes`). Postgres **no** crea índices automáticos para las FK, y ni `synchronize` ni las migraciones generadas los agregaron.
- **Estado actual** (solo PK/UNIQUE, ningún índice adicional):

  | Tabla | Índices existentes | Falta |
  |---|---|---|
  | `comments` | PK(id) | `propertyId`, `userId` |
  | `notifications` | PK(id) | `userId`, `targetRole`, `read` |
  | `ratings` | PK(id), UQ(userId,propertyId) | `propertyId` |
  | `favorites` | PK(user_id,property_id) | `property_id` |
  | `property` | PK(id) | `status`, `created_at`, `localidad`/`barrio`/`zone` |
  | `post_comments` | PK(id) | `postId`, `parentCommentId` |
  | `property_images` | PK(id), UQ(hash) | `propertyId` |

- **Por qué importa**: son justo las consultas más calientes. `GET /notifications` y `/notifications/unread-count` (que la campanita del frontend consulta cada 60 s) hacen **seq scan sobre 356 filas** y creciendo; `GET /properties/filter` filtra siempre por `status` y ordena por `created_at` sin índice; el ranking `mostFavorited` agrupa por `property_id` sin índice. Además, borrar una propiedad o un usuario obliga a Postgres a escanear cada tabla hija para resolver el CASCADE.
- **Solución**: una migración con los índices de la tabla, priorizando `notifications(userId, targetRole, read)`, `comments(propertyId)`, `ratings(propertyId)`, `favorites(property_id)` y `property(status, created_at)`.

### 11. ✅ RESUELTO — `GET /properties` tenía N+1 y no tenía paginación
- **Dónde**: `src/modules/properties/properties.service.ts:48-79` (`findAll`).
- **Qué pasa**: trae **todas** las propiedades con 4 relaciones y después, dentro de un `Promise.all`, ejecuta **una consulta `AVG(rating.score)` por cada propiedad**. Con 14 propiedades son 15 queries y **510 ms / 28 KB**; con 200 propiedades son 201 queries y una respuesta de cientos de KB, sin forma de pedir menos.
- **Por qué importa**: es un endpoint público sin tope. Además el promedio ya se resuelve elegantemente en `filter()` mediante subconsulta correlacionada — acá se resuelve por el camino caro.
- **Solución**: reemplazar el `Promise.all` por la misma subconsulta que usa `filter()` (`(SELECT COALESCE(AVG(r.score),0) FROM ratings r WHERE r."propertyId" = p.id)`) y agregar paginación. Si el frontend ya usa `/properties/filter` para el catálogo, evaluar directamente deprecar `GET /properties`.

### 12. ⬜ ABIERTO — `GET /statistics` carga tablas enteras en memoria, 12 veces por request
- **Dónde**: `src/modules/statistics/statistics.service.ts` — `combinedTextCount` (×6), `combinedAverage` (×3), `resolvePropertyTypeNames`, `priceRanges`, `extrasUsage`. Cada uno hace su propio `this.filterRepo.find({ where: { createdAt: MoreThan(since) } })` y `this.prefRepo.find(...)` **completos**, y agrega en JavaScript.
- **Qué pasa**: una sola llamada a `searchedFeatures()` lee **12 veces la tabla `filter_usages` entera** y 11 veces `search_preferences`. Hoy: 174 filas, **300 ms**, aceptable. Pero `filter_usages` crece **una fila por cada búsqueda de cada visitante**: es la tabla que más rápido va a crecer del sistema.
- **Por qué importa**: no rompe nada al lanzar (por eso no es 🔴), pero se degrada rápido y de forma no lineal: con 100.000 búsquedas acumuladas son 1.2 millones de filas materializadas en memoria de Node por cada apertura del dashboard, con riesgo de OOM.
- **Solución**: reemplazar los `find()` + agregación en JS por `GROUP BY` en SQL (una query por métrica devolviendo `label, count`), como ya hacen bien `traffic()`, `mostViewed()` y `ownInventory()`. Complementariamente, agregar una política de retención o de agregados diarios para `filter_usages` y `page_visits`.

### 13. ✅ RESUELTO — el admin no veía los comentarios que él mismo ocultaba
- **Dónde**: `src/modules/posts/posts.controller.ts:92-100` — `GET /posts/:id/comments` está `@Public()` y lee `@GetUser('role')`, **pero no tiene `@UseGuards(OptionalJwtAuthGuard)`**, a diferencia de `GET /posts` y `GET /posts/:id` que sí lo tienen.
- **Qué pasa**: `JwtAuthGuard` cortocircuita en las rutas `@Public()` sin ejecutar passport, así que `req.user` queda vacío **incluso para el admin logueado**. `role === Role.ADMIN` es siempre `false` y `includeHidden` siempre `false`.
- **Verificado en vivo**: el admin ocultó una respuesta y luego, consultando el endpoint **con su sesión**, no la recibió.
- **Por qué importa**: la moderación blanda queda de una sola dirección — el admin puede ocultar pero después no encuentra el comentario para revertirlo. El comentario del propio `optional-jwt-auth.guard.ts` menciona este caso de uso como razón de existir del guard; simplemente no se aplicó en la ruta.
- **Solución**: agregar `@UseGuards(OptionalJwtAuthGuard)` al método, igual que en las otras dos rutas públicas del mismo controlador. (Nota: el equivalente en propiedades, `comments.controller.ts:307`, **sí** lo tiene bien puesto.)

### 14. ⬜ ABIERTO — un `:id` no numérico en propiedades devuelve 500
- **Dónde**: `src/modules/properties/properties.controller.ts:71-87` (`@Param('id') id: string` + `+id`), `:141` (`remove`), `:148` (`deleteImage`); mismo patrón en `typeOfProperty.controller.ts` y en `notifications.controller.ts:519`.
- **Verificado en vivo**: `GET /properties/abc` → **500** `{"statusCode":500,"message":"Internal server error"}`, con `QueryFailedError: la sintaxis de entrada no es válida para tipo integer: «NaN»` en el log (y un segundo error colateral en `TrackingService`).
- **Por qué importa**: cualquier bot, crawler o link roto (`/properties/undefined` es un clásico del frontend) genera 500s y ruido en los logs, tapando errores reales. Semánticamente es un 400. El resto del proyecto ya resolvió esto con `ParseIntPipe` (favoritos, ratings, comentarios, posts, property-requests).
- **Solución**: usar `@Param('id', ParseIntPipe) id: number` en esos controladores, como ya se hace en el resto del repo.

### 15. ⬜ ABIERTO — `POST /users` es una segunda vía de registro sin el rate limit estricto
- **Dónde**: `src/modules/users/users.controller.ts:25-28` — sin guards y sin `@Throttle`.
- **Verificado en vivo**: `POST /users` con un email nuevo → **201**, usuario creado.
- **Por qué importa**: `/auth/register` está limitado a 5/min justamente para frenar el alta masiva de cuentas, pero este endpoint hace lo mismo bajo el límite global de 100/min — 20× más permisivo. Además no dispara `notifyAdminNewUser()` ni registra `authProvider` de forma diferenciada, así que las altas por esta vía quedan fuera de las notificaciones al admin.
- **Solución**: si el frontend no lo usa (todo el registro pasa por `/auth/register`), eliminarlo. Si se mantiene por compatibilidad, agregarle el mismo `@Throttle({ default: { limit: 5, ttl: 60_000 } })`.

### 16. 📋 DECISIÓN PENDIENTE — Gmail SMTP como transporte de envíos masivos
- **Dónde**: `.env` (`SMTP_HOST=smtp.gmail.com`, `EMAIL_FROM=matidiazargentino21@gmail.com`) + `src/modules/notifications/email/email.service.ts`.
- **Qué pasa**: al estar definida `SMTP_HOST`, el servicio usa Nodemailer/Gmail y **no** SendGrid. La causa está registrada en los datos: las 77 filas de `failed_emails` son todas `"Maximum credits exceeded"` de SendGrid (22–29 de julio) — se agotó la cuota del plan.
- **Por qué importa**: `broadcastNewProperty()` y `handleNewPost()` mandan a **todos** los usuarios en cada publicación. Gmail SMTP tiene un tope duro (~500 destinatarios/día) y no está pensado para envío transaccional en volumen: al crecer la base, los envíos se van a cortar de nuevo y se arriesga que Google marque la cuenta. Además un remitente `@gmail.com` para una plataforma perjudica la entregabilidad (SPF/DKIM/DMARC del dominio propio).
- **Solución**: mover el envío a un proveedor transaccional con dominio propio verificado (SendGrid pago, Resend, Amazon SES) y usar un `EMAIL_FROM` del dominio de CercaTrova. El código ya soporta ambos transportes sin cambios: alcanza con quitar `SMTP_HOST` del `.env` y poner una `SENDGRID_API_KEY` con cuota.

### 17. ✅ RESUELTO — `PropertyFilterDto.title` estaba declarado pero no filtraba nada
- **Dónde**: `src/modules/properties/dto/property-filter.dto.ts:40-42`; `properties.service.ts:336-364` — `title` **no** se desestructura de `filters` ni se usa en ninguna condición del query builder.
- **Verificado en vivo**: `?limit=100` → 10 resultados; `?limit=100&title=zzzz_no_existe_nada_zzzz` → **también 10**.
- **Por qué importa**: es un contrato de API mentiroso — el DTO lo acepta y devuelve 200, así que quien lo use en el frontend va a creer que filtra. La búsqueda por título ya la cubre `?search=`, que sí incluye `p.title` en el `Brackets` de búsqueda textual.
- **Solución**: eliminar el campo del DTO (documentando en el contrato que se usa `?search=`), o implementarlo con el mismo `unaccent(p.title) ILIKE unaccent(:title)`. Recomendado: eliminarlo, para no duplicar la funcionalidad de `search`.

### 18. ✅ RESUELTO — dos archivos de enums muertos
- **Dónde**: `src/modules/requests/dto/enumsRequest.ts` y `src/modules/search-preferences/dto/enumTypeOfProperty.ts`.
- **Verificado con grep**: nadie importa `enumsRequest.ts` — `PropertyTypeEnum` está redefinido por separado en `create-request.dto.ts:18` y en `request.entity.ts:10`. `enumTypeOfProperty.ts` **sí** se importa en `search-preference.entity.ts:11`, pero **no se usa**: el campo `typeOfProperty` de esa entidad es la relación con la **entidad** `PropertyType`, no el enum.
- **Por qué importa**: ruido menor, pero confunde a quien lea el módulo — un enum de tipos de propiedad importado en la entidad sugiere que los tipos son un enum fijo, cuando en realidad son una tabla editable por el admin (`property_types`, 7 filas hoy).
- **Solución**: borrar los dos archivos y el import muerto de `search-preference.entity.ts:11`. Verificar con `npm run build` (el compilador confirma que no hay referencias).

---

## 🔵 REFORZAR A FUTURO

- **`failed_emails` no tiene reproceso ni purga.** Las 77 filas acumuladas nadie las reintenta ni las mira; la tabla solo crece. Vale un endpoint admin de consulta (o al menos una query documentada) y un job de reintento/limpieza.
- **Retención de datos de telemetría.** `page_visits` (1222 filas), `filter_usages` (174) y `property_views` (38) crecen sin techo, una fila por evento. Definir una política: purgar detalle > 90 días y guardar agregados diarios.
- **Refresh token (F1).** El diseño ya está documentado en FEATURES.md y sigue vigente. Hoy la sesión dura lo que dure el JWT y no hay renovación silenciosa; conviene retomarlo cuando el frontend tenga el interceptor.
- **`GET /ratings/:propertyId` no tiene ningún guard** (`ratings.controller.ts:38`). Es la única ruta del proyecto sin `@UseGuards` **ni** `@Public()` explícito — funciona por omisión, no por decisión. Devuelve `id, name, photo` de quienes valoraron. Aunque el dato sea equivalente al de los comentarios públicos, conviene marcarla `@Public()` para que la intención quede escrita.
- **Cobertura de tests.** Los 14 tests actuales cubren guards y autorización, que era el agujero histórico. Los siguientes candidatos, por valor/esfuerzo: `VALID_TRANSITIONS` de PropertyRequest (lógica pura, fácil de testear), `PostsService.findComments` (habría atrapado el 🔴 #5), y `UsersService.updateUser` (habría atrapado el 🔴 #1).
- **`POST /tracking/visit` devuelve el `visitId` y acepta 120 req/min por IP anónima.** Un script puede inflar `page_visits` y distorsionar el dashboard. No es crítico (son métricas internas, no dinero), pero si alguna decisión se va a tomar con esos números conviene sumar validación del `path` contra una lista de rutas conocidas.
- **Backlog de lint.** 1184 problemas de formato auto-corregibles. Vale resolverlo en un commit propio, aislado (`npm run lint` + `npm run format`), sin mezclar con cambios funcionales, y sumar un hook de pre-commit para que no vuelva a crecer.
- **`ensureExists()` hace un `findOne` extra** antes de casi toda operación. Es correcto y legible, pero duplica consultas en rutas calientes; a futuro se puede resolver con `RETURNING` o capturando la violación de FK.

---

## ⚠️ CAMBIOS DE CONTRATO — el frontend tiene que acompañar

### 1. `GET /properties` ahora es paginado *(rompe si se consume)*
Antes devolvía un **array plano** con todas las propiedades; ahora devuelve
`{ data, meta }`, igual que `GET /properties/filter`, con `limit` por defecto 10.

```diff
- [ { id: 1, ... }, { id: 2, ... } ]
+ { data: [ { id: 1, ... } ], meta: { totalItems, itemCount, totalPages, currentPage } }
```

Si el catálogo usa `GET /properties/filter` (que ya era paginado y no cambió su
forma), esto **no afecta a nada**. Si algo consume `GET /properties` hay que
leer `.data` y, si necesita todo, paginar o pasar `?limit=100`.

### 2. El ADMIN ya no puede usar las rutas de USER *(comportamiento confirmado — no es un bug)*
Al aplicar el `RolesGuard` que faltaba, estas rutas pasaron de **201/200 a 403**
para un usuario con rol admin:

- `GET /favorites`, `POST /favorites/:propertyId`, `DELETE /favorites/*`
- `POST /ratings/:propertyId`
- `POST /search-preferences`

Antes el `@Roles(Role.USER)` no se aplicaba y el admin entraba por el bug de
guard faltante. **Decisión confirmada (2026-08-04): este bloqueo es el
comportamiento correcto y se queda así** — un admin no necesita
favoritear/valorar/guardar preferencias desde su propia cuenta de gestión. Si
el panel admin tenía montado algún componente de favoritos o de valoración
pensado para usuarios, no debería usarse en una sesión de admin; no hace falta
ningún cambio de backend.

### 3. `?title=` en `/properties/filter` ahora responde 400
Antes se aceptaba y no filtraba. Si el frontend lo manda, hay que sacarlo y usar
`?search=`.

### 4. Agregados (no rompen nada)
- `GET /properties/filter` → cada item trae **`ratingAverage`**.
- `GET /notifications` y `/notifications/admin` → cada notificación trae **`type`**.
- `GET /properties/:id` → trae **`favoritesCount`** y **ya no** trae `favorites`.
- El objeto `agent` de las respuestas públicas ahora es
  `{ id, name, surname, phone, photo }` — **sin `email`**. Si alguna pantalla
  mostraba el email del agente, hay que decidir si se vuelve a incluir.

---

## 🗄️ MIGRACIONES DE DATOS — leer antes de aplicar en producción

De las 4 migraciones, **3 tocan datos existentes**, no solo schema. En una base
productiva nueva son inocuas (no hay filas); el aviso vale para cualquier
ambiente que ya tenga datos.

| Migración | Qué le hace a los datos |
|---|---|
| `InitialSchema` | Solo crea estructura. Inocua. |
| `AddNotificationType` | **UPDATE** sobre `notifications`: reclasifica cada fila por su `title`. No borra nada. Lo que no matchee queda en `'generica'`. |
| `AddForeignKeyIndexes` | `CREATE INDEX` común → **toma lock de escritura** en cada tabla mientras construye. Instantáneo con el volumen actual (máx. ~1200 filas). Sobre tablas grandes y en caliente, conviene `CREATE INDEX CONCURRENTLY`, que no corre dentro de una transacción y habría que ejecutar fuera del runner. |
| `UniqueSearchPreferencePerUser` | ⚠️ **DELETE**: borra las preferencias duplicadas antes de crear el índice único (sin esto el `CREATE UNIQUE INDEX` falla). Conserva la de `updatedAt` más reciente. En desarrollo no había duplicados (0 filas afectadas). **Salvaguarda agregada 2026-08-04**: antes de borrar, la migración ahora (1) loguea por consola cuántas filas y de qué `userId` se van a borrar, y (2) copia esas filas completas a `_migration_backup_search_preferences_dupes` — una tabla que la migración **nunca borra**, ni en `up` ni en `down`, así que en producción queda disponible para auditar qué se borró (o recuperar algo a mano) incluso si nadie capturó la salida del deploy en el momento. |

**Orden de despliegue recomendado:** `migration:run` → arrancar con
`NODE_ENV=production` → verificar `/auth/me` y `/properties/filter`.

---

## 🔎 ENDPOINTS SIN CONSUMIDOR CONOCIDO — candidatos a revisar

No puedo confirmar el lado del frontend desde acá. Esta es la lista de
candidatos para que la cruces, ordenada por confianza. Son **110 endpoints**
en total; abajo hay ~50 sospechosos.

### 🔴 Alta confianza — respaldado por datos

**El módulo `stats` viejo + `feedback/search` (26 endpoints).**
`user_search_feedback` tiene **0 filas**. Esa tabla es la única fuente de los 22
endpoints `/stats/*`, así que **todos devuelven vacío o ceros hoy**, y se llena
únicamente con `POST /feedback/search`, que nunca se usó. El dashboard real es
el módulo `statistics/`, que lee las tablas de tracking.

- `POST /feedback/search`, `GET /feedback/search`, `GET /feedback/search/:id`, `GET /feedback/search/check/:deviceId`, `GET /feedback/search/stats/zones`
- `GET /stats/property-type` · `/top` · `/least`
- `GET /stats/operation-type` · `/top` · `/least`
- `GET /stats/zones` · `GET /stats/cities`
- `GET /stats/price/average` · `/ranges` · `/by-property-type` · `/by-zone` · `/min` · `/max`
- `GET /stats/rooms/average` · `/distribution` · `GET /stats/bathrooms/average`
- `GET /stats/extras` · `/patio` · `/garage` — ⚠️ **las tres llaman al mismo método** `extrasUsage()`: son 3 rutas para la misma respuesta
- `GET /stats/antiquity/average` · `/new-construction`

→ *Si se confirma que el formulario de feedback no existe en el frontend, se pueden
eliminar los módulos `stats/` y `requests/` completos (2 módulos, 2 entidades,
26 rutas).*

### 🟠 Media confianza — duplicados o reemplazados

| Endpoint | Por qué es candidato |
|---|---|
| `DELETE /properties/image/:id` | Duplica exactamente a `DELETE /property-images/:id`; el propio comentario del controller dice *"Si querés mantener endpoint aquí (opcional)"* |
| `GET /properties` | El catálogo usa `/properties/filter`. Además es el que acaba de cambiar de contrato — si nadie lo consume, se puede eliminar en vez de mantenerlo |
| `POST /users` | Segunda vía de registro; el flujo real es `POST /auth/register` (ver 🟡 15) |
| `PATCH /users/:id` | Desde F7 el usuario edita su perfil por `PATCH /users/me`; `:id` solo tendría sentido para uso admin |
| `GET /ratings/:propertyId` | El detalle de la propiedad ya devuelve `ratings` y `ratingAverage` |
| `GET /property-types/:id` | Los dropdowns usan `GET /property-types` (la lista) |
| `GET /property-images/:id` | Las imágenes ya llegan embebidas en las respuestas de propiedad |
| `PATCH /notifications/admin/read-all` | Existe también `PATCH /notifications/read-all`; el panel podría usar solo uno |
| Los 11 `GET /statistics/<sección>` | Si el dashboard llama a `GET /statistics` (el overview que devuelve las 11 secciones juntas), los individuales son redundantes |

### 🟡 Baja confianza — plausibles pero podrían estar en uso

| Endpoint | Para qué serviría |
|---|---|
| `GET /property-requests/user/:userId` | Que el admin vea todas las solicitudes de un dueño concreto |
| `GET /search-preferences/user/:id` | Que el admin lea las preferencias de un usuario |
| `GET /users/:id` | Ver el perfil de otro usuario (ver 🟡 9 — hoy además es una fuga de PII) |
| `GET /properties/filters/locations` | Poblar los selects de localidad/barrio/zona |
| `GET /my-comments` · `GET /ratings/mine` | Las secciones "mis comentarios" / "propiedades que valoré" del dashboard del usuario |
| `PATCH /properties/:propertyId/comments/:commentId/hide` | Moderación de comentarios de propiedades (el equivalente en posts sí se usa) |
| `DELETE /favorites/all` | Botón "vaciar favoritos" |
| `GET /property-requests/my-requests/:id` | Detalle de una solicitud propia |

### ✅ Confirmados en uso (por datos, no hace falta revisarlos)
`POST /tracking/visit` y `POST /tracking/duration`: **1226 de 1243** visitas
tienen `durationMs` cargado y hay **51 paths distintos** registrados — el
frontend los llama correctamente, incluido el `sendBeacon` del cierre.

---

## 📋 DECISIÓN PENDIENTE — transporte de email (🟡 16)

**No es un problema de código: el código soporta los dos transportes sin
cambios.** Es una decisión de negocio que hay que tomar antes de producción.

**Estado confirmado (2026-08-04): sigue sin acción de código.** No se tocó nada
de `EmailService` ni del `.env` en esta tanda — el punto se mantiene documentado
como decisión de negocio pendiente, no como bug del backend.

**Situación actual:** `SMTP_HOST=smtp.gmail.com` está definida, así que
`EmailService` usa Nodemailer/Gmail y **no** SendGrid. La causa está en los
datos: las 77 filas de `failed_emails` son todas `"Maximum credits exceeded"` de
SendGrid entre el 22 y el 29 de julio — se agotó la cuota del plan y se migró a
Gmail como salida de emergencia. Durante toda la auditoría el envío por SMTP
funcionó: **0 fallos nuevos**.

**Por qué hay que decidirlo:** `broadcastNewProperty()` y `handleNewPost()`
envían a **todos** los usuarios en cada publicación. Gmail SMTP tiene un tope
duro de ~500 destinatarios/día y no está pensado para transaccional en volumen:
al crecer la base los envíos se van a cortar igual que se cortaron con SendGrid,
y se arriesga que Google marque la cuenta. Además `EMAIL_FROM` es una casilla
`@gmail.com` personal, lo que perjudica la entregabilidad (SPF/DKIM/DMARC del
dominio propio).

**Opciones:**
1. **Plan pago de SendGrid** — quitar `SMTP_HOST` del `.env` y poner una
   `SENDGRID_API_KEY` con cuota. Cero cambios de código, y se recupera el envío
   en lote (1 request por cada 1000 destinatarios en vez de 1 por destinatario).
2. **Otro proveedor transaccional** (Resend, Amazon SES) con dominio propio
   verificado.
3. **Aceptar Gmail SMTP a largo plazo** — viable solo si se asume el techo de
   ~500/día y se acepta el riesgo de bloqueo. Con la base actual (13 usuarios)
   alcanza; con 200 usuarios, una sola publicación consume el 40% del cupo diario.

En cualquiera de los tres casos conviene mover `EMAIL_FROM` a una dirección del
dominio de CercaTrova.

---

## Resumen ejecutivo

**Los 5 bloqueantes 🔴 están resueltos y verificados en vivo; el backend puede
desplegarse.** Dos eran configuración y no código (`ADMIN_PASSWORD` de 6
caracteres, `FRONTEND_URL`/`NODE_ENV` sin definir) y tres eran de código: la fuga
del hash bcrypt en `PATCH /users/*`, la migración base faltante y el comentario
padre que desaparecía al ocultar su única respuesta. El set de migraciones se
probó **de verdad** contra una base Postgres vacía: corre sin error y produce un
schema idéntico al de las entidades (193 columnas, 38 índices, cero diferencias).

Se resolvieron además los 3 pedidos de coordinación del frontend
(`OptionalJwtAuthGuard`, `ratingAverage`, campo `type`) y 7 de los 🟡 de alto
impacto — con dos que **requieren acompañamiento del frontend**: `GET /properties`
pasó a ser paginado y el ADMIN ya no entra a las rutas de USER.

**Antes de deployar quedan dos cosas que no dependen del backend:** definir el
transporte de email (Gmail SMTP no sostiene el envío masivo a largo plazo) y
completar el `.env` de producción con el dominio real y `NODE_ENV=production`.
Quedan 4 🟡 abiertos que no estaban en este pedido — el más relevante es que
cualquier usuario logueado puede leer el email y el teléfono de cualquier otro
vía `GET /users/:id`.
