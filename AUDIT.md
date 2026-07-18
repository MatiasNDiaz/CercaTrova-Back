# AUDITORÍA DE SEGURIDAD Y CALIDAD — CercaTrova-Back

> Fecha: 2026-07-18 · Solo diagnóstico, sin cambios aplicados.
> Severidades: 🔴 CRÍTICO · 🟡 MEDIO · 🟢 BAJO

---

## RESUMEN EJECUTIVO

| Severidad | Cantidad | Los más urgentes |
|---|---|---|
| 🔴 CRÍTICO | 9 | Escalada a ADMIN vía `POST /users`, password en texto plano, Google OAuth sin `GOOGLE_CLIENT_ID`, endpoints admin sin guard, IDOR en favoritos |
| 🟡 MEDIO | 12 | `@Roles` decorativo sin RolesGuard, sin rate limiting, `synchronize: true`, validación bypasseada en properties, sesión sin revocación |
| 🟢 BAJO | 8 | Enumeración de usuarios, lint roto, inconsistencias en DTOs |

---

## 1. TABLA DE GUARDS POR CONTROLADOR

| Controlador | JwtAuthGuard | RolesGuard | Veredicto |
|---|---|---|---|
| `auth.controller.ts` | Solo en `/me` | — | ✅ Correcto (login/register/google son públicos por diseño) |
| `users.controller.ts` | ✅ (excepto `POST /users`) | ✅ en GET all / DELETE | 🔴 `POST /users` público acepta `role` y no hashea password (ver C1, C2) |
| `properties.controller.ts` | ✅ a nivel controller | ✅ a nivel controller | ✅ Diseño correcto (`@Public()` en lecturas) — pero validación bypasseada (M4) |
| `PropertyRequest/propertyRequest.controller.ts` | ✅ a nivel controller | ✅ por ruta admin | ✅ Correcto — es el patrón de referencia |
| `notifications.controller.ts` | ✅ a nivel controller | ✅ en rutas admin | 🟡 `PATCH :id/read` sin check de dueño (M6) |
| `comments.controller.ts` | ✅ en escrituras (`AuthGuard('jwt')`) | ❌ (`@Roles` decorativo) | ✅ Aceptable — ownership validado en service |
| `favorites.controller.ts` | ✅ | ❌ (`@Roles` decorativo) | 🔴 IDOR: `userId` viene del param, no del token (C5) |
| `ratings.controller.ts` | ✅ en POST | ❌ (`@Roles` decorativo) | ✅ Aceptable — GET público razonable |
| `requests.controller.ts` (feedback) | ✅ en rutas admin | ✅ en rutas admin | ✅ Correcto (creación anónima con deviceId es por diseño) |
| `search-preferences.controller.ts` | ✅ a nivel controller | ❌ **NO aplicado** | 🔴 `GET /search-preferences/user/:id` era admin-only pero cualquier logueado accede (C6) |
| `stats.controller.ts` | ❌ **NINGUNO** | ❌ **NINGUNO** | 🟡 Todas las métricas de negocio son públicas (M3) |
| `typeOfProperty.controller.ts` | ❌ **NINGUNO** | ❌ **NINGUNO** | 🔴 CRUD completo sin autenticación (C3) |
| `ImagesProperty/propertyImages.controller.ts` | ❌ **NINGUNO** | ❌ (`@Roles` decorativo) | 🔴 DELETE y set-cover de imágenes sin autenticación (C4) |

**Regla clave que causa la mayoría de estos hallazgos:** `@Roles(...)` **no protege nada por sí solo**. Solo funciona si `RolesGuard` está en `@UseGuards(...)`. En `favorites`, `comments`, `ratings`, `search-preferences` y `propertyImages` hay `@Roles` sin `RolesGuard` → decorativo.

---

## 2. HALLAZGOS CRÍTICOS 🔴

### C1 — Escalada de privilegios: cualquiera puede registrarse como ADMIN
- **Archivo:** [users.controller.ts:21-24](src/modules/users/users.controller.ts#L21-L24) + [create-user.dto.ts:32-34](src/modules/users/dto/create-user.dto.ts#L32-L34)
- **Riesgo:** `POST /users` es público y `CreateUserDto` acepta `role` (`@IsOptional() @IsEnum(Role)`). Un atacante envía `{ ..., "role": "admin" }` y obtiene una cuenta ADMIN con acceso total (borrar usuarios, propiedades, ver todo).
- **Nota:** `POST /auth/register` NO es vulnerable porque `RegisterDto` no incluye `role` y `forbidNonWhitelisted` rechaza el campo extra. El problema es que existen **dos endpoints de registro** y el de `/users` quedó abierto.
- **Solución:** Eliminar `role` de `CreateUserDto` (o eliminar `POST /users` público y dejar solo `/auth/register`). Si un admin necesita crear usuarios con rol, hacer un endpoint separado con `@Roles(ADMIN)`.

### C2 — `POST /users` guarda el password EN TEXTO PLANO
- **Archivo:** [users.controller.ts:21-24](src/modules/users/users.controller.ts#L21-L24) → [users.service.ts:40-59](src/modules/users/users.service.ts#L40-L59)
- **Riesgo:** `UsersService.createUser()` no hashea; el hash lo hace `AuthService.register()` antes de llamarlo. Todo usuario creado vía `POST /users` queda con password sin hashear en la DB. Además la respuesta devuelve la entidad completa, password incluido.
- **Solución:** Mover el hash de bcrypt adentro de `UsersService.createUser()` (única fuente de verdad), o eliminar el endpoint público (misma solución que C1).

### C3 — CRUD de tipos de propiedad totalmente público
- **Archivo:** [typeOfProperty.controller.ts:1-35](src/modules/typeOfProperty/typeOfProperty.controller.ts#L1-L35)
- **Riesgo:** Sin ningún guard. Cualquiera puede crear, renombrar o **borrar** tipos de propiedad. Borrar un tipo referenciado rompe el filtrado del frontend, el matching de notificaciones y las propiedades existentes (relación `eager` en `Property`).
- **Solución:** `@UseGuards(JwtAuthGuard, RolesGuard)` a nivel controller + `@Roles(ADMIN)` en POST/PATCH/DELETE, con `@Public()` en los GET (el frontend los usa para dropdowns).

### C4 — Borrado de imágenes de propiedades sin autenticación
- **Archivo:** [propertyImages.controller.ts:17-27](src/modules/ImagesProperty/propertyImages.controller.ts#L17-L27)
- **Riesgo:** `@Roles(Role.ADMIN)` está, pero **no hay ningún `@UseGuards`** → `DELETE /property-images/:id` y `PATCH /property-images/:id/set-cover` son públicos. Un atacante puede borrar todas las imágenes del sitio (también las elimina de Cloudinary, irreversible).
- **Solución:** Agregar `@UseGuards(JwtAuthGuard, RolesGuard)` a nivel controller.

### C5 — IDOR en favoritos: leer y borrar favoritos de cualquier usuario
- **Archivo:** [favorites.controller.ts:36-64](src/modules/favorites/favorites.controller.ts#L36-L64)
- **Riesgo:** `GET /favorites/:userId`, `DELETE /favorites/:userId/:propertyId` y `DELETE /favorites/all/:userId` toman el `userId` **del parámetro de URL**, no del token. Cualquier usuario logueado puede enumerar los favoritos de otros (fuga de datos de comportamiento) o borrárselos todos.
- **Solución:** Reemplazar el param por `@GetUser('id')` (como ya hace el `POST`), o validar `req.user.id === +userId || req.user.role === ADMIN`.

### C6 — Preferencias de búsqueda de terceros expuestas a cualquier logueado
- **Archivo:** [search-preferences.controller.ts:33-37](src/modules/search-preferences/search-preferences.controller.ts#L33-L37)
- **Riesgo:** `GET /search-preferences/user/:id` tiene `@Roles(Role.ADMIN)` pero el controller solo aplica `AuthGuard('jwt')` — **nunca se registra `RolesGuard`** → cualquier usuario autenticado lee las preferencias (presupuesto, zona, etc.) de cualquier otro. Son datos personales.
- **Solución:** `@UseGuards(RolesGuard)` en esa ruta.

### C7 — Google OAuth: `GOOGLE_CLIENT_ID` no existe en `.env` → verificación de audience anulada
- **Archivo:** [google.auth.service.ts:10-17](src/modules/auth/google.auth.service.ts#L10-L17)
- **Riesgo:** Verificado: el `.env` actual **no define `GOOGLE_CLIENT_ID`**. `verifyIdToken({ audience: undefined })` hace que `google-auth-library` **omita la validación de audience**: un `idToken` legítimo emitido por Google para *cualquier otra aplicación* (cualquier sitio con "Sign in with Google") sería aceptado por este backend → suplantación de cuenta con solo conocer el email de la víctima si ésta usa Google en otro sitio malicioso. Adicionalmente no se valida `payload.email_verified`.
- **Solución:** (1) Definir `GOOGLE_CLIENT_ID` en `.env` y **fallar el arranque** si falta (validación en el constructor). (2) Verificar `payload.aud === GOOGLE_CLIENT_ID` explícitamente y exigir `payload.email_verified === true` antes de crear/loguear al usuario.

### C8 — `GET /users` y `GET /users/:id` devuelven el hash de password
- **Archivo:** [users.service.ts:62-81](src/modules/users/users.service.ts#L62-L81)
- **Riesgo:** `getAllUsers()` y `getUserById()` devuelven la entidad `User` completa. `GET /users/:id` está abierto a **cualquier usuario logueado** → todos los hashes bcrypt (y teléfonos/emails de todos) quedan expuestos para cracking offline. `AuthService.getMe` sí lo filtra, pero `UsersController` no.
- **Solución:** `@Column({ select: false })` en `password` (y cargar explícitamente solo en login), o `@Exclude()` de class-transformer + `ClassSerializerInterceptor` global.

### C9 — API key de SendGrid impresa en consola + fallback de JWT secret
- **Archivos:** [email.service.ts:10](src/modules/notifications/email/email.service.ts#L10) y [auth.module.ts:31](src/modules/auth/auth.module.ts#L31)
- **Riesgo:** (a) `console.log("API KEY LEÍDA:", ...)` vuelca la key de SendGrid a stdout — en cualquier hosting (Render, Railway, etc.) queda persistida en logs accesibles al panel/terceros. (b) Si `JWT_SECRET` falta, el sistema arranca firmando tokens con el string público `'FALLBACK_SECRET'` → cualquiera puede forjar tokens ADMIN. También [bootstrap.service.ts:49](src/common/bootstraps/bootstrap.service.ts#L49) loguea el **password del admin en texto plano**.
- **Solución:** Eliminar los tres logs. Para JWT: lanzar error al arrancar si `JWT_SECRET` no está definido, nunca un fallback.

---

## 3. AUTENTICACIÓN Y PERSISTENCIA DE SESIÓN

### Cómo funciona hoy (tradicional y Google, idéntico flujo)
1. `POST /auth/login` o `POST /auth/google` → valida credenciales/idToken → firma **un único JWT** (`sub`, `email`, `role`) → lo setea en cookie `access_token` (`httpOnly`, `maxAge` 24 h).
2. `JwtStrategy` lee la cookie (`cookieExtractor`) en cada request.
3. El frontend rehidrata la sesión con `GET /auth/me`.

### Respuestas a las preguntas de la auditoría

- **¿Se mantiene la sesión al refrescar/cerrar el navegador?** Sí, mientras no pasen 24 h: la cookie es persistente (`maxAge` 24 h) y `httpOnly`, así que sobrevive refresh y cierre del navegador. **A las 24 h la sesión muere sin aviso y sin renovación** — no existe refresh token.
- **¿Refresh token vs access token?** 🟡 **No hay refresh token** (M1). Un solo access token de 24 h: demasiado largo para un access token (ventana de abuso si se roba), demasiado corto para "mantenerme logueado". Además el `maxAge` de la cookie (24 h hardcodeado en [auth.controller.ts:22](src/modules/auth/auth.controller.ts#L22)) puede desincronizarse de `JWT_EXPIRATION_TIME` del `.env` — si el JWT expira antes que la cookie, el usuario queda con "sesión fantasma" que falla con 401.
- **Cookies:** 🔴 `secure: false` **hardcodeado** y **sin `sameSite`** en login y google ([auth.controller.ts:22,29](src/modules/auth/auth.controller.ts#L22)). En producción la cookie viajaría por HTTP plano y `sameSite` por defecto (`lax` en Chrome, pero no garantizado) queda implícito. Irónicamente `logout` sí usa `sameSite: 'lax'` y `secure` condicional — configuración inconsistente entre set y clear (si los atributos no coinciden, algunos navegadores no borran la cookie). **Solución:** un solo helper `setCookie/clearCookie` con `httpOnly: true, sameSite: 'lax', secure: NODE_ENV === 'production'` para los tres endpoints.
- **Logout:** 🟡 Solo borra la cookie en el cliente ([auth.controller.ts:42-50](src/modules/auth/auth.controller.ts#L42-L50)). **El token sigue siendo válido hasta expirar**: quien lo haya capturado (o el propio usuario guardándolo antes del logout) puede seguir usándolo 24 h. No hay blacklist ni versionado de tokens (M2).
- **`JwtStrategy.validate()`:** 🟡 [jwt.strategy.ts:25-27](src/modules/auth/strategies/jwt.strategy.ts#L25-L27) **no consulta la DB**: si el usuario fue eliminado, su token sigue funcionando hasta 24 h (los endpoints que buscan al usuario fallarán con errores raros, pero rutas como crear PropertyRequest aceptan el `userId` fantasma). Si un admin le baja el rol a alguien, el token viejo **conserva `role: admin`** hasta expirar. **Solución:** en `validate()`, buscar el usuario por `payload.sub` y lanzar `UnauthorizedException` si no existe; tomar el `role` de la DB, no del payload.
- **Google — callback/errores:** el flujo es de idToken (el frontend hace el popup y manda el token), no de redirect — no hay callback URL en el backend que validar. Si el usuario cancela o Google falla, el frontend simplemente no llama a `/auth/google`; si manda un token inválido, `verifyIdToken` lanza y se responde `400` genérico. Correcto, **excepto** por C7 (audience).
- **Vinculación de cuentas:** email ya registrado tradicional + login con Google → **se loguea sobre la misma cuenta** (busca por email, no duplica). Aceptable *solo si* se valida `email_verified` (C7); sin eso, es un vector de toma de cuenta. Al revés (cuenta Google → login tradicional): bloqueado correctamente en [auth.service.ts:46-50](src/modules/auth/auth.service.ts#L46-L50) porque el usuario Google tiene `password: ''`. 🟢 El mensaje "Este usuario se registró con Google" revela el método de registro de un email ajeno (enumeración, B1).
- **Secretos de Google:** no hay nada hardcodeado (usa `process.env.GOOGLE_CLIENT_ID`) y no se usa CLIENT_SECRET (flujo idToken no lo necesita). El problema es el inverso: la variable **falta** (C7).

---

## 4. ROLES Y PERMISOS

- **Rutas admin protegidas en backend:** `PropertyRequest` (listar todo, cambiar estado, borrar), `users` (listar, borrar), `properties` (crear/editar/borrar), `notifications/admin`, `feedback/search` (stats) — ✅ todas con `JwtAuthGuard + RolesGuard + @Roles(ADMIN)` reales.
- **Rutas admin NO protegidas (solo "ocultas" en el frontend):** `typeOfProperty` CRUD (C3), `property-images` DELETE/set-cover (C4), `search-preferences/user/:id` (C6), `stats/*` (M3).
- **Rol default de usuarios Google:** ✅ correcto — [auth.service.ts:76](src/modules/auth/auth.service.ts#L76) asigna `Role.USER` explícito, y la columna tiene `default: Role.USER`. No hay camino a ADMIN por esta vía. El camino a ADMIN es C1 (`POST /users`).
- 🟡 **M5 — `RolesGuard` sin `JwtAuthGuard` produce 500:** [roles.guard.ts:24](src/common/guards/roles.guard.ts#L24) hace `user.role` sin verificar que `user` exista. Si alguien aplica `RolesGuard` solo (error fácil de cometer, ya que hoy el orden lo salva), revienta con `TypeError` → 500. **Solución:** `if (!user) throw new ForbiddenException()`.
- 🟢 **B7 — `UpdateUserDto.isAdmin`:** [update-user.dto.ts:28-30](src/modules/users/dto/update-user.dto.ts#L28-L30) declara un campo `isAdmin` que **no existe en la entidad** (la entidad usa `role`). Hoy es inofensivo (se descarta al guardar), pero es una mina: si alguien renombra o mapea ese campo, `PATCH /users/:id` (que permite editarse a sí mismo) se convierte en escalada de privilegios. Eliminarlo.

---

## 5. NOTIFICACIONES

### Flujo publicación → match → DB → email
`PropertiesService.createWithImages()` → `NotificationService.handleNewProperty()` → recorre `SearchPreferences` (matching por tipo, operación, zona, precio, m², etc.) → guarda `Notification` en DB → email SendGrid por match → luego `broadcastNewProperty()` al resto de usuarios. La cadena existe y está bien encadenada, **pero**:

- 🟡 **M7 — Propiedades sin imágenes NO disparan ninguna notificación:** [properties.service.ts:113-123](src/modules/properties/properties.service.ts#L113-L123) hace `return` temprano cuando `images.length === 0`, **antes** del paso 5 que llama a `handleNewProperty()`. Una propiedad creada sin fotos jamás notifica a nadie (ni matching ni broadcast). **Solución:** mover el disparo de notificaciones antes del early-return.
- 🟡 **M8 — Broadcast masivo sin opt-out:** `broadcastNewProperty()` emaila a **todos los usuarios** por **cada** propiedad nueva; `handlePriceChange()` a casi todos por cada baja de precio. `notifyNewMatches` solo excluye del matching, no del broadcast. Con N usuarios reales esto es spam + agotamiento de cuota SendGrid (100 mails/día en plan free) + alta probabilidad de ir a spam. **Solución:** respetar una preferencia de opt-in para el broadcast, o eliminarlo y dejar solo matching.
- **Estados de PropertyRequest:** el enum tiene 4 estados (`ENVIADO`, `REVISION`, `ACEPTADO`, `RECHAZADO`) y [notifications.service.ts:222-227](src/modules/notifications/notifications.service.ts#L222-L227) cubre los 4 + fallback. ✅ `updateStatus()` siempre notifica. ⚠️ Pero al **crear** la solicitud (estado inicial `ENVIADO`) se notifica al admin y **no al usuario** — el usuario nunca recibe el mail "Solicitud recibida" (ese template solo se dispara si un admin re-setea el estado a ENVIADO). → ver Funcionalidades faltantes F3.
- **Usuarios de Google:** ✅ reciben igual — el matching/broadcast filtra por `user.email`, que los usuarios Google siempre tienen. Sin diferencias.
- **Si SendGrid falla:** se loguea por consola y **la notificación por email se pierde para siempre** — no hay retry ni cola ([notifications.service.ts:126-128](src/modules/notifications/notifications.service.ts#L126-L128) y equivalentes). La notificación en DB sí queda guardada (se persiste antes del email), así que el usuario la ve en la campanita. Aceptable para MVP; ver F4.
- **SENDGRID_API_KEY:** ✅ no está hardcodeada (viene de `ConfigService`), pero se imprime en logs (C9).
- 🟡 **M6 — IDOR menor en `markAsRead`:** [notifications.controller.ts:20-23](src/modules/notifications/notifications.controller.ts#L20-L23) + [notifications.service.ts:272-275](src/modules/notifications/notifications.service.ts#L272-L275): cualquier usuario puede marcar como leída la notificación de otro (impacto bajo, pero es un `update` sin ownership). **Solución:** `WHERE id = :id AND userId = :userId`.
- 🟢 **B6 — Remitente hardcodeado:** `from: 'matidiazargentino21@gmail.com'` en [email.service.ts:20](src/modules/notifications/email/email.service.ts#L20). Mover a `.env` (`EMAIL_FROM`) — además Gmail como remitente en SendGrid falla DMARC; usar dominio verificado.

---

## 6. SEGURIDAD GENERAL E INFRAESTRUCTURA

- 🟡 **M4 — ValidationPipe bypasseado en properties:** [properties.controller.ts:59-70 y 77-94](src/modules/properties/properties.controller.ts#L59-L94) reciben `@Body('data')` como string y hacen `JSON.parse()` a mano → **`CreatePropertyDto`/`UpdatePropertyDto` nunca pasan por class-validator**. Campos faltantes, tipos incorrectos o campos extra llegan directo a TypeORM (errores 500, datos corruptos). Mitigado porque es admin-only, pero es el endpoint de escritura principal. **Solución:** `plainToInstance(CreatePropertyDto, JSON.parse(rawData))` + `validateOrReject`, o un pipe custom para multipart.
- 🟡 **M9 — Sin rate limiting en absoluto:** no está `@nestjs/throttler` en `package.json`. `/auth/login` es fuerza-brutable sin límite (bcrypt ralentiza pero no impide), `/auth/register` y `/auth/google` igual, y el "anti-spam" de feedback depende de un `deviceId` que el cliente controla. **Solución:** `ThrottlerModule` global + límites estrictos en `auth/*` (ej. 5/min por IP).
- 🟡 **M10 — `synchronize: true` sin migrations:** [typeorm.config.ts:30](src/config/typeorm.config.ts#L30). En producción, cualquier cambio de entidad altera el schema real automáticamente (puede **dropear columnas con datos** al renombrar). No hay carpeta de migrations. **Solución antes de deployar:** `synchronize: false` + TypeORM migrations (`migration:generate`/`migration:run`), controlado por `NODE_ENV`.
- 🟡 **M11 — CORS hardcodeado:** [main.ts:11](src/main.ts#L11) fija `http://localhost:3001`. Al deployar el frontend, todo fallará hasta editar código. **Solución:** `origin: process.env.FRONTEND_URL?.split(',') ?? 'http://localhost:3001'`.
- 🟡 **M12 — Uploads sin validación de tipo ni tamaño:** ningún `FileInterceptor`/`FilesInterceptor` ([users.controller.ts:29](src/modules/users/users.controller.ts#L29), [properties.controller.ts:58](src/modules/properties/properties.controller.ts#L58)) define `limits` ni `fileFilter`. Se puede subir un ejecutable de 500 MB como "foto de perfil": consumo de memoria (multer usa memoria con Cloudinary storage en buffer), cuota de Cloudinary, y archivos no-imagen almacenados. **Solución:** `{ limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: solo image/* }`.
- 🟡 **Manejo de errores — fuga de detalles internos:** [users.service.ts:54-58, 66-69, 78-80](src/modules/users/users.service.ts#L54-L80) concatena `error.message` crudo en la respuesta (`'No se pudo crear el usuario: ' + error.message`) → mensajes de Postgres/TypeORM (nombres de tablas, constraints) llegan al cliente. Además el patrón `catch → BadRequestException` re-envuelve excepciones que ya eran correctas (un `BadRequestException` interno se vuelve a envolver con prefijo). NestJS por defecto **no** expone stack traces, eso está bien. **Solución:** no concatenar `error.message`; loguear internamente y responder mensaje genérico.
- 🟢 **B2 — Services que lanzan `Error` genérico → 500:** [favorites.service.ts:29-35,69,77](src/modules/favorites/favorites.service.ts#L29-L77) y [search-preferences.service.ts:31](src/modules/search-preferences/search-preferences.service.ts#L31) lanzan `throw new Error(...)` → el cliente recibe `500 Internal Server Error` en casos que son 400/404 ("favorito ya existe"). Usar excepciones de NestJS.
- **Cloudinary:** ✅ credenciales solo por env vars. Falta la validación de uploads (M12).
- 🟢 **B3 — Password del admin por defecto:** viene de `ADMIN_PASSWORD` sin ninguna validación de fortaleza ([bootstrap.service.ts:24-27](src/common/bootstraps/bootstrap.service.ts#L24-L27)) y se imprime en el log al crearlo (parte de C9). Si en algún ambiente se setea `admin123`, arranca igual. **Solución:** exigir longitud mínima (12+) o abortar, y jamás loguearlo.
- **DTOs con class-validator:** ✅ presentes en casi todos los endpoints de entrada. Excepciones: properties create/update (M4) y `POST /ratings/:propertyId` que usa `@Body('score')` suelto sin DTO ([ratings.controller.ts:16](src/modules/ratings/ratings.controller.ts#L16)) — el service valida rango 1-5 pero no el tipo (B5).

---

## 7. HALLAZGOS BAJOS 🟢 (resumen)

| # | Hallazgo | Archivo | Solución |
|---|---|---|---|
| B1 | Enumeración de usuarios: register responde "Usuario ya existente" y login distingue "se registró con Google" | [auth.service.ts:22,46-50](src/modules/auth/auth.service.ts#L22) | Mensajes genéricos ("Credenciales inválidas" / "Si el email es válido recibirás...") |
| B2 | `throw new Error()` genérico → 500 en favoritos/search-prefs | favorites.service.ts, search-preferences.service.ts | Excepciones HTTP de NestJS |
| B3 | Password admin sin validación de fortaleza y logueado | bootstrap.service.ts:49 | Validar longitud, no loguear |
| B4 | `npm run lint` está ROTO: error de sintaxis (verificado con `node --check`) | [eslint.config.mjs:35](eslint.config.mjs#L35) | Eliminar el bloque `"prettier/prettier": [...]` suelto fuera del objeto de reglas |
| B5 | `@Body('score')` sin DTO en ratings; comparación numérica con posible string | [ratings.controller.ts:16](src/modules/ratings/ratings.controller.ts#L16) | DTO con `@IsInt() @Min(1) @Max(5)` |
| B6 | Remitente de email hardcodeado (Gmail personal) | email.service.ts:20 | `EMAIL_FROM` en `.env` + dominio verificado en SendGrid |
| B7 | Campo muerto `isAdmin` en UpdateUserDto (mina de escalada futura) | update-user.dto.ts:28-30 | Eliminar |
| B8 | Inconsistencias menores: `MinLength(4)` en login vs `MinLength(5)` en register; `LoginDto`/`RegisterDto` aceptan `id`/`createdAt` del cliente; cookie `maxAge` hardcodeada puede desalinearse de `JWT_EXPIRATION_TIME` | dto/login-auth.dto.ts, register-auth.dto.ts, auth.controller.ts | Unificar y limpiar campos; derivar `maxAge` de la config |

---

## FUNCIONALIDADES FALTANTES (mejoras, no bugs)

- **F1 — Refresh token / "recordarme":** hoy la sesión dura exactamente 24 h y muere sin renovación. Implementar par access token corto (15-60 min) + refresh token httpOnly de larga duración con rotación, o al menos renovación silenciosa del JWT en `/auth/me`.
- **F2 — Revocación de sesión en logout:** blacklist de tokens (con TTL en memoria o Redis) o un `tokenVersion` por usuario verificado en `JwtStrategy.validate()`, para que cerrar sesión invalide de verdad.
- **F3 — Notificación "Solicitud recibida" al crear PropertyRequest:** el template para estado `ENVIADO` existe pero nunca se dispara en el `create()` — solo se notifica al admin. Llamar a `handleRequestStatusChange(saved)` también en la creación.
- **F4 — Cola/reintentos de emails:** ante fallo de SendGrid el email se pierde (solo log). Una cola simple (BullMQ) o un reintento con backoff daría resiliencia; hoy no hay registro consultable de emails fallidos.
- **F5 — Preferencia de opt-out de emails masivos:** campo tipo `notifyBroadcast`/suscripción por usuario, y link de "desuscribirse" en los templates (requisito legal en varios países para mail masivo).
- **F6 — Migrations de TypeORM:** complemento de M10 — flujo de migraciones versionadas antes de producción.
- **F7 — Endpoint de perfil propio para update:** hoy el usuario se edita vía `PATCH /users/:id` con check manual; un `PATCH /users/me` basado en el token simplificaría y reduciría superficie de IDOR.
- **F8 — Vinculación explícita de cuentas Google ↔ tradicional:** un usuario Google no puede establecer contraseña local (y `profileIncomplete` nunca se marca `true` pese a crear el usuario con `phone: ''`). Flujo de "completar perfil" + "establecer contraseña".
- **F9 — Helmet + headers de seguridad:** `helmet()` en `main.ts` (CSP, HSTS, etc.) — estándar en producción.
- **F10 — Tests:** no existe ningún `*.spec.ts` en `src/`. Mínimo: tests de guards/roles (que habrían detectado C3-C6) y del matching de notificaciones.

---

*Auditoría generada por Claude Code. Los hallazgos críticos C1-C9 deberían resolverse antes de cualquier deploy público; C1+C2 y C7 son los de explotación más directa.*
