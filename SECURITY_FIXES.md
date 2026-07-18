# SECURITY_FIXES — Registro de correcciones de seguridad

> Correcciones aplicadas sobre los hallazgos de AUDIT.md (2026-07-18).

## Impacto en frontend

_(Se listan acá los cambios de contrato de API que requieren actualizar el repo del frontend.)_

- **C1:** `POST /users` ya no acepta el campo `role` en el body. Si el frontend lo enviaba (aunque fuera `"user"`), ahora recibe `400 Bad Request` por `forbidNonWhitelisted`. Solución: dejar de enviar `role`.
- **C4:** `GET /property-images/:id` ahora requiere JWT (el guard quedó a nivel controller). Si el frontend consultaba una imagen suelta sin sesión, debe hacerlo logueado (las imágenes siguen llegando públicamente embebidas en `GET /property`).
- **C5:** cambian las rutas de favoritos — el `userId` ya no viaja en la URL, sale del token: `GET /favorites/:userId` → `GET /favorites`; `DELETE /favorites/:userId/:propertyId` → `DELETE /favorites/:propertyId`; `DELETE /favorites/all/:userId` → `DELETE /favorites/all`. `POST /favorites/:propertyId` no cambia.
- **15:** `POST /auth/logout` ahora requiere sesión válida (cookie presente y no expirada); si responde 401, el frontend debe tratarlo como "sesión ya cerrada". Además, al deployar este cambio todas las sesiones activas quedan invalidadas una única vez (los tokens viejos no traen `tokenVersion`).

---

## C1 - Escalada de privilegios vía POST /users
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/users/dto/create-user.dto.ts`, `src/modules/auth/auth.service.ts`
- Problema original: `POST /users` era público y `CreateUserDto` aceptaba `role`, permitiendo a cualquiera registrarse como ADMIN.
- Cambio aplicado: Se eliminó el campo `role` (y su import de `Role`) de `CreateUserDto`; el rol queda siempre asignado por el `default: Role.USER` de la entidad. Se eligió esta opción (en vez de eliminar el endpoint) porque no rompe ningún flujo de registro existente. En el mismo paso se quitó `role: Role.USER` del objeto que `AuthService.googleLogin()` construye, ya que dependía del campo eliminado.
- Estado: ✅ Corregido y verificado con npm run build

## C2 - Password en texto plano en POST /users
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/users/users.service.ts`, `src/modules/auth/auth.service.ts`, `src/modules/users/dto/create-user.dto.ts`
- Problema original: `UsersService.createUser()` no hasheaba (el hash lo hacía solo `AuthService.register()`), por lo que `POST /users` guardaba el password en texto plano; además la respuesta devolvía la entidad completa con password.
- Cambio aplicado: El hash de bcrypt se movió adentro de `createUser()` como única fuente de verdad (sin hashear el string vacío, que identifica a los usuarios de Google). Se eliminó el hash previo en `AuthService.register()` para evitar doble hash, y `createUser()` ahora quita `password` del objeto devuelto. En `googleLogin()` se agregó fallback de rol porque `save()` no devuelve columnas con default. Limpieza de datos: se verificó la DB en busca de usuarios con password no-bcrypt — resultado: 0 filas, no hubo datos que migrar/borrar.
- Estado: ✅ Corregido y verificado con npm run build

## C7 - Google OAuth sin validar audience ni email_verified
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/auth/google.auth.service.ts`, `.env.example` (nuevo)
- Problema original: `GOOGLE_CLIENT_ID` no estaba definido en `.env`, con lo cual `verifyIdToken({ audience: undefined })` omitía la validación de audience: un idToken legítimo de cualquier otra app con "Sign in with Google" era aceptado. Tampoco se exigía `email_verified`.
- Cambio aplicado: `GoogleAuthService` ahora recibe `ConfigService`, falla el arranque de la app si `GOOGLE_CLIENT_ID` no está definido, valida explícitamente `payload.aud === GOOGLE_CLIENT_ID` y exige `payload.email_verified === true` antes de crear/loguear. Se creó `.env.example` con todas las variables requeridas (solo nombres).
- ⚠️ ACCIÓN REQUERIDA: agregar `GOOGLE_CLIENT_ID` al `.env` real — la app no arranca sin él.
- Estado: ✅ Corregido y verificado con npm run build

## C9 - Secretos en logs y fallback de JWT_SECRET
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/notifications/email/email.service.ts`, `src/common/bootstraps/bootstrap.service.ts`, `src/modules/auth/auth.module.ts`, `src/modules/auth/strategies/jwt.strategy.ts`
- Problema original: la API key de SendGrid y el password del admin en texto plano se imprimían en los logs; si faltaba `JWT_SECRET`, la app arrancaba firmando tokens con el string público `'FALLBACK_SECRET'` (cualquiera podía forjar tokens ADMIN).
- Cambio aplicado: Se eliminaron los logs de la API key y del password del admin. Se eliminó el fallback: tanto el `useFactory` del `JwtModule` como el constructor de `JwtStrategy` lanzan error y abortan el arranque si `JWT_SECRET` no está definido.
- Estado: ✅ Corregido y verificado con npm run build

## C8 - Password expuesto en GET /users y GET /users/:id
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/users/entities/user.entity.ts`, `src/modules/users/users.service.ts`, `src/modules/auth/auth.service.ts`
- Problema original: `getAllUsers()` y `getUserById()` devolvían la entidad completa con el hash bcrypt, expuesto a cualquier usuario logueado para cracking offline.
- Cambio aplicado: `@Column({ select: false })` en `password`: ninguna query lo carga por defecto. Se agregó `findUserByEmailWithPassword()` (query builder con `addSelect`) como único punto del sistema que carga el hash, usado exclusivamente por `AuthService.login()` — sin esto, todo login habría dejado de funcionar (bcrypt.compare contra undefined).
- Estado: ✅ Corregido y verificado con npm run build

## C4 - Borrado de imágenes de propiedades sin autenticación
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/ImagesProperty/propertyImages.controller.ts`
- Problema original: el controller tenía `@Roles(ADMIN)` pero ningún `@UseGuards` → `DELETE /property-images/:id` y `PATCH /property-images/:id/set-cover` eran públicos (borrado irreversible en Cloudinary).
- Cambio aplicado: `@UseGuards(JwtAuthGuard, RolesGuard)` a nivel controller. DELETE y set-cover quedan solo-ADMIN (sus `@Roles` ahora sí se aplican); `GET /:id` requiere JWT.
- Estado: ✅ Corregido y verificado con npm run build

## C5 - IDOR en favoritos
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/favorites/favorites.controller.ts`
- Problema original: `GET /favorites/:userId`, `DELETE /favorites/:userId/:propertyId` y `DELETE /favorites/all/:userId` tomaban el `userId` de la URL — cualquier logueado podía enumerar o borrar los favoritos de otro.
- Cambio aplicado: Se eliminó `:userId` de todas las rutas; el id sale de `@GetUser('id')` (token). Guard `JwtAuthGuard` movido a nivel controller. `DELETE all` quedó declarada antes que `DELETE :propertyId` para evitar colisión de rutas, y los params usan `ParseIntPipe`.
- Estado: ✅ Corregido y verificado con npm run build

## C6 - Preferencias de búsqueda de terceros expuestas
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/search-preferences/search-preferences.controller.ts`
- Problema original: `GET /search-preferences/user/:id` tenía `@Roles(ADMIN)` pero el controller solo aplicaba `AuthGuard('jwt')` — cualquier usuario autenticado leía las preferencias (presupuesto, zonas) de cualquier otro.
- Cambio aplicado: Se agregó `@UseGuards(RolesGuard)` en esa ruta; ahora el `@Roles(ADMIN)` se aplica de verdad y un no-admin recibe 403.
- Estado: ✅ Corregido y verificado con npm run build

## C3 - CRUD de tipos de propiedad totalmente público
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/typeOfProperty/typeOfProperty.controller.ts`
- Problema original: el controller no tenía ningún guard — cualquiera podía crear, renombrar o borrar tipos de propiedad (rompiendo filtros, matching de notificaciones y propiedades existentes).
- Cambio aplicado: `@UseGuards(JwtAuthGuard, RolesGuard)` a nivel controller, `@Roles(ADMIN)` en POST/PATCH/DELETE y `@Public()` en los dos GET para no romper los dropdowns del frontend.
- Estado: ✅ Corregido y verificado con npm run build

## M5 - RolesGuard sin JwtAuthGuard produce error 500
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/common/guards/roles.guard.ts`
- Problema original: `RolesGuard` accedía a `user.role` sin verificar que `user` exista; aplicado sin `JwtAuthGuard` delante, reventaba con `TypeError` → 500.
- Cambio aplicado: Si `request.user` no existe, se lanza `ForbiddenException` (403) antes de evaluar roles.
- Estado: ✅ Corregido y verificado con npm run build

## M6 - IDOR menor en notificaciones (markAsRead)
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/notifications/notifications.service.ts`, `src/modules/notifications/notifications.controller.ts`
- Problema original: `PATCH /notifications/:id/read` actualizaba por id sin verificar dueño — cualquier usuario podía marcar como leída la notificación de otro.
- Cambio aplicado: `markAsRead()` ahora recibe `userId` y `role` del token y actualiza con `WHERE id = :id AND "userId" = :userId`; para admins se permite además `targetRole = 'admin'` (las notificaciones de admin no tienen usuario dueño y la misma ruta sirve para ambos roles). Si no afecta filas → 404.
- Estado: ✅ Corregido y verificado con npm run build

## B7 - Campo muerto isAdmin en UpdateUserDto
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/users/dto/update-user.dto.ts`
- Problema original: el DTO declaraba `isAdmin` (inexistente en la entidad) — inofensivo hoy, pero mina de escalada de privilegios si alguien lo mapeaba a `role`.
- Cambio aplicado: Se eliminó el campo y su import de `IsBoolean`. Verificado con grep que ningún otro código lo referenciaba.
- Estado: ✅ Corregido y verificado con npm run build

## 13 - Cookies de sesión inconsistentes entre login/google/logout
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/auth/auth-cookie.helper.ts` (nuevo), `src/modules/auth/auth.controller.ts`
- Problema original: login y google seteaban la cookie con `secure: false` hardcodeado y sin `sameSite`; logout la borraba con otros atributos (riesgo de que el navegador no la borre) y el `maxAge` de 24 h hardcodeado podía desincronizarse del `JWT_EXPIRATION_TIME`.
- Cambio aplicado: Helper único `setAuthCookie`/`clearAuthCookie` con `httpOnly: true`, `sameSite: 'lax'`, `secure: NODE_ENV === 'production'` y `maxAge` derivado de `JWT_EXPIRATION_TIME` (mismos atributos en set y clear). Los tres endpoints usan solo el helper. De paso se limpiaron imports muertos del controller.
- Estado: ✅ Corregido y verificado con npm run build

## 14 - JwtStrategy.validate() no consultaba la base de datos
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/auth/strategies/jwt.strategy.ts`
- Problema original: `validate()` devolvía los datos del payload sin tocar la DB: un usuario eliminado seguía autenticando hasta 24 h, y un cambio de rol no tenía efecto hasta expirar el token viejo.
- Cambio aplicado: Se inyectó `UsersService` en la estrategia (ya exportado por `UsersModule`); `validate()` busca al usuario por `payload.sub` en cada request, lanza `UnauthorizedException` si no existe, y arma `req.user` con el `role` actual de la DB (el del payload se ignora). La forma de `req.user` no cambió, así que ningún controller/guard se ve afectado.
- Estado: ✅ Corregido y verificado con npm run build

## 15 (M1/M2) - Revocación real de sesión con tokenVersion
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/users/entities/user.entity.ts`, `src/modules/users/users.service.ts`, `src/modules/auth/auth.service.ts`, `src/modules/auth/strategies/jwt.strategy.ts`, `src/modules/auth/auth.controller.ts`
- Problema original: logout solo borraba la cookie del navegador — el JWT seguía siendo válido hasta expirar (24 h); no existía ningún mecanismo de revocación.
- Cambio aplicado: Opción (a) confirmada por el usuario. Columna `tokenVersion` (default 0) en `User`, incluida en el payload del JWT en login y googleLogin, y verificada en `JwtStrategy.validate()` contra el valor actual de la DB (reutiliza la misma query del punto 14 — costo cero adicional). `POST /auth/logout` ahora requiere JWT, llama a `AuthService.logout()` → `UsersService.incrementTokenVersion()` y recién después borra la cookie. Cambiar el password vía `updateUser()` también incrementa `tokenVersion`.
- Estado: ✅ Corregido y verificado con npm run build

## Hallazgo adicional (durante verificación) - CreateUserDto con @Transform roto
- Fecha: 2026-07-18
- Archivo(s) modificado(s): `src/modules/users/dto/create-user.dto.ts`
- Problema original: los `@Transform(({value}) => {value?.trim()})` de `name`, `surname`, `phone` y `password` usaban llaves sin `return`, devolviendo `undefined` — TODA request a `POST /users` fallaba con 400 desde antes de este hardening (consistente con que la DB no tenía ningún usuario con password plano). Detectado en la verificación end-to-end, no figuraba en AUDIT.md.
- Cambio aplicado: Se corrigieron las arrow functions para que devuelvan `value?.trim()`. Con esto `POST /users` quedó funcional y seguro (sin `role`, con hash).
- Estado: ✅ Corregido y verificado con npm run build + prueba end-to-end

---

## Verificación de flujos completos (2026-07-18)

Se levantó el server compilado contra la DB local (con un `GOOGLE_CLIENT_ID` dummy inyectado solo en ese proceso) y se corrió una batería end-to-end por HTTP real: **35/35 PASS**.

1. **Login tradicional:** registro → login (cookie `httpOnly` seteada) → `GET /auth/me` 200 → logout → **el token viejo devuelve 401** (13+14+15 coherentes). Ninguna respuesta incluye `password`.
2. **Google:** solo se pudo verificar el rechazo de idToken inválido (400) — el flujo feliz requiere un idToken real emitido para el `GOOGLE_CLIENT_ID` productivo. Verificación manual pendiente: configurar la variable real, loguear desde el frontend con el popup de Google y confirmar cookie + `/auth/me` + logout idénticos al flujo tradicional; probar además un idToken de otra app (debe dar 401 "no fue emitido para esta aplicación").
3. **Favoritos:** `GET /favorites` sin token → 401; ruta vieja `GET /favorites/:userId` → 404; cada usuario solo ve/borra los suyos (no había properties en la DB local para probar el alta, pero el aislamiento por token queda garantizado porque el `userId` ya no es un input).
4. **Admin vs user:** `property-types` (GET público 200; POST user 403 / sin auth 401 / admin 201; DELETE admin 200), `property-images` (DELETE sin auth 401, user 403), `search-preferences/user/:id` (user 403, admin 200), `GET /users` (user 403, admin 200 y sin passwords).
- Usuarios de prueba creados por la batería: eliminados vía `DELETE /users/:id` como admin al final de la corrida.
