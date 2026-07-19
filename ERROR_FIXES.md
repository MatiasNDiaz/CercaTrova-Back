# ERROR_FIXES — Correcciones de manejo de errores y validaciones

> Implementación de TODOS los hallazgos de ERROR_HANDLING_AUDIT.md (ALTA, MEDIA y BAJA), sobre el código ya hardened (SECURITY_FIXES.md, SECURITY_FIXES_2.md, FEATURES.md).

## Impacto en frontend

_(Cambios de contrato: códigos HTTP nuevos donde antes había otro, formatos de mensaje nuevos.)_

- **stats:** `GET /stats/cities` ahora responde con el campo `localidad` (antes intentaba `city`, columna inexistente — el endpoint directamente tiraba 500, así que nada podía depender de él). Los endpoints de porcentaje con DB vacía devuelven `[]` o ceros en vez de 500.
- **auth:** el login fallido ahora responde **401** (antes 400), mismo mensaje "Credenciales inválidas" — revisar interceptores del frontend que traten 401 como "sesión expirada" para que no interfieran con la pantalla de login. `POST /auth/google` sin `idToken` → 400 "El idToken de Google es obligatorio".
- **users:** usuario inexistente ahora es **404** (antes 400) en `GET/PATCH/DELETE /users/:id` y `PATCH /users/me`; cambiar el email a uno ya usado → **409** "Ese email no está disponible" (antes 500); fallo de Cloudinary en la foto de perfil → **502** "No pudimos procesar la imagen, intentá de nuevo"; `POST /users` ahora exige password de mínimo 5 caracteres.
- **properties:** si Cloudinary falla al crear → **502** "No se pudieron procesar las imágenes. Intentá de nuevo." (y la property NO queda creada); `typeOfPropertyId` inexistente en update → **404** (antes 500); filtro `?status=` con valor inválido → **400** con la lista de valores permitidos (antes devolvía lista vacía en silencio).
- **typeOfProperty:** borrar un tipo en uso → **409** "No se puede eliminar: hay propiedades usando este tipo" (antes 500).
- **ratings:** valorar una property inexistente → **404** "La propiedad indicada no existe" (antes 500); carrera de doble valoración → **409** "Ya valoraste esta propiedad".
- **favorites:** carrera de favorito duplicado → **409** (antes 500), mismo mensaje que el caso normal.
- **PropertyRequest:** `PATCH :id/status` con valor inválido → **400** "Estado inválido. Valores permitidos: enviado, en_revision, aceptado, rechazado"; transición ilegal (ej. reabrir una aceptada) → **409** "No se puede pasar la solicitud de 'X' a 'Y'" — el panel admin debería deshabilitar los botones de transiciones inválidas; `tipoPropiedad`/`tipoOperacion`/`estadoConservacion` ahora solo aceptan los valores de los dropdowns actuales (Casa/Departamento/Terreno/Local/Oficina/Quinta · Venta/Alquiler/Alquiler temporal · Excelente/Muy bueno/Bueno/Regular/A refaccionar) → cualquier otro string da 400; `habitaciones`/`baños`/`antiguedad` negativos → 400.
- **comments:** los mensajes de error ahora están en español (si el frontend hacía matching por texto en inglés, actualizar).

---

## [stats] - 5 endpoints del dashboard admin rotos con 500
- Fecha: 2026-07-19
- Archivo(s): `src/modules/stats/stats.service.ts`
- Problema original: `demandByCity` consultaba la columna inexistente `city`; `averageAntiquity` y `newConstructionInterest` usaban `antiquityMin` (inexistente); `priceRanges` tenía literales SQL inválidos (`120k`/`200k`); y TODAS las queries de porcentaje dividían por `total` sin guard → 500 con la tabla vacía.
- Cambio aplicado: `city` → `localidad`; `antiquityMin` → `antiquityMax` (única columna real); `120k/200k` → `120000/200000`; guard `total === 0` en `propertyTypeDemand`, `operationTypeDemand`, `demandByZone`, `demandByCity`, `roomsDistribution`, `extrasUsage` (devuelve ceros con la misma forma) y `newConstructionInterest` (devuelve `{count: 0, percentage: 0}`). Se revisó el archivo completo: no quedan otras divisiones por `total`.
- Estado: ✅ Corregido y verificado con npm run build

## [users] - Los catch filtraban error.message de la DB al cliente
- Fecha: 2026-07-19
- Archivo(s): `src/modules/users/users.service.ts`, `src/common/helpers/handle-service-error.helper.ts` (nuevo)
- Problema original: `createUser`, `getAllUsers` y `getUserById` concatenaban `error.message` crudo (nombres de tablas/constraints de Postgres) en la respuesta, y re-envolvían excepciones ya construidas (el mensaje anti-enumeración de B1 quedaba "No se pudo crear el usuario: No se pudo completar el registro…"). `updateUser`/`deleteUser` no tenían manejo.
- Cambio aplicado: Helper `handleServiceError(logger, error, msgPúblico)`: re-lanza tal cual cualquier `HttpException` construida a propósito; el resto se loguea completo con `Logger` de Nest y el cliente recibe solo el mensaje genérico (500). Aplicado a los 5 métodos.
- Estado: ✅ Corregido y verificado con npm run build

## [users] - Email duplicado al actualizar → 500
- Fecha: 2026-07-19
- Archivo(s): `src/modules/users/users.service.ts`, `src/common/helpers/database-error.helper.ts` (nuevo)
- Problema original: cambiar el email a uno ya registrado (vía `PATCH /users/:id` o `PATCH /users/me`) violaba la constraint unique y salía como 500 crudo.
- Cambio aplicado: Helper `isUniqueViolation()` (código 23505 de Postgres). En `updateUser` → `ConflictException` 409 "Ese email no está disponible" (sin revelar de quién es). En `createUser`, la misma carrera responde el mensaje genérico anti-enumeración de B1 (400), idéntico al pre-check.
- Estado: ✅ Corregido y verificado con npm run build

## [ratings] - Valorar una property inexistente → 500 por FK
- Fecha: 2026-07-19
- Archivo(s): `src/modules/ratings/ratings.service.ts`, `src/modules/ratings/ratings.module.ts`, `src/common/helpers/ensure-exists.helper.ts` (nuevo)
- Problema original: `rateProperty()` creaba el rating con `property: { id }` sin validar la referencia — la FK de Postgres lo rechazaba con 500.
- Cambio aplicado: Helper genérico `ensureExists(repo, id, nombre)` → 404 "La propiedad indicada no existe". Se registró `Property` en el `forFeature` del módulo para inyectar su repositorio.
- Estado: ✅ Corregido y verificado con npm run build

## [PropertyRequest] - PATCH :id/status aceptaba cualquier string → 500
- Fecha: 2026-07-19
- Archivo(s): `src/modules/PropertyRequest/dto/updateRequestStatusDto.ts` (nuevo), `src/modules/PropertyRequest/propertyRequest.controller.ts`
- Problema original: `@Body('status')` era un string crudo sin DTO; un valor fuera del enum de Postgres reventaba con 500 cuando el admin cambiaba el estado.
- Cambio aplicado: `UpdateRequestStatusDto` con `@IsEnum(RequestStatus)` y mensaje "Estado inválido. Valores permitidos: enviado, en_revision, aceptado, rechazado" → 400 claro. El body sigue siendo `{ "status": "..." }`.
- Estado: ✅ Corregido y verificado con npm run build

## [properties/ImagesProperty] - Property huérfana si Cloudinary falla al crear
- Fecha: 2026-07-19
- Archivo(s): `src/modules/properties/properties.service.ts`
- Problema original: en `createWithImages()` la property se guarda ANTES de subir las imágenes; si Cloudinary fallaba, quedaba una publicación sin fotos y el cliente veía 500.
- Cambio aplicado: Rollback manual (opción confirmada por el usuario — una transacción de TypeORM no revierte lo externo a la DB y exigía refactorizar `createMany`): try/catch alrededor de la subida; ante fallo se borran las imágenes que hayan alcanzado a persistirse y la property recién creada (best-effort, logueando si el rollback falla) y se responde **502** "No se pudieron procesar las imágenes. Intentá de nuevo."
- Estado: ✅ Corregido y verificado con npm run build

## [users] - Usuario inexistente devolvía 400 en vez de 404
- Fecha: 2026-07-19
- Archivo(s): `src/modules/users/users.service.ts`
- Problema original: `getUserById`, `updateUser` y `deleteUser` respondían `BadRequestException` (400) para un usuario inexistente — el frontend no podía distinguir "no existe" de "datos inválidos".
- Cambio aplicado: los tres métodos usan `ensureExists(userRepository, id, 'El usuario')` → **404** "El usuario no existe". Afecta `/auth/me` (usuario borrado con token viejo ya daba 401 por el punto 14, sin cambios ahí), perfil y flujos admin.
- Estado: ✅ Corregido y verificado con npm run build

## [typeOfProperty] - Borrar un tipo en uso → 500 por FK
- Fecha: 2026-07-19
- Archivo(s): `src/modules/typeOfProperty/typeOfProperty.service.ts`, `src/modules/typeOfProperty/typeOfProperty.module.ts`
- Problema original: borrar un tipo referenciado por properties violaba la FK → 500 crudo sin explicación para el admin.
- Cambio aplicado: antes de eliminar se cuenta cuántas properties usan el tipo; si hay alguna → `ConflictException` 409 "No se puede eliminar: hay propiedades usando este tipo". Se registró `Property` en el `forFeature` del módulo.
- Estado: ✅ Corregido y verificado con npm run build

## [properties] - typeOfPropertyId sin validar en update
- Fecha: 2026-07-19
- Archivo(s): `src/modules/properties/properties.service.ts`
- Problema original: `update()` asignaba el dto sin re-validar el tipo → id inexistente violaba la FK → 500 (create ya lo validaba).
- Cambio aplicado: misma validación que create: `findOne` del tipo → 404 "No existe el tipo de propiedad con ID X", y se asigna la relación completa.
- Estado: ✅ Corregido y verificado con npm run build

## [PropertyRequest + comments] - Texto libre en campos categóricos y mensajes en inglés
- Fecha: 2026-07-19
- Archivo(s): `src/modules/PropertyRequest/dto/enumsPropertyRequest.ts` (nuevo), `src/modules/PropertyRequest/dto/createRequestPropertyDto.ts`, `src/modules/comments/comments.service.ts`
- Problema original: `tipoPropiedad`/`tipoOperacion`/`estadoConservacion` eran `@IsString()` libre (datos inconsistentes con stats y Property); los mensajes de error de comments estaban en inglés, rompiendo la convención.
- Cambio aplicado: enums `TipoPropiedadRequest` (Casa, Departamento, Terreno, Local, Oficina, Quinta), `TipoOperacionRequest` (Venta, Alquiler, Alquiler temporal) y `EstadoConservacionRequest` (Excelente, Muy bueno, Bueno, Regular, A refaccionar) — valores calcados de la DB real y confirmados por el usuario; mensajes de error listan los valores permitidos. La columna de la entidad sigue siendo string (filas existentes intactas). Comments: todos los mensajes traducidos al español.
- Estado: ✅ Corregido y verificado con npm run build

## [properties] - Borrados irreversibles de Cloudinary a mitad de camino en update() y remove()
- Fecha: 2026-07-19
- Archivo(s): `src/modules/properties/properties.service.ts`
- Problema original: `update()` borraba imágenes de Cloudinary ANTES de guardar el resto (un fallo posterior dejaba imágenes destruidas y cambios sin persistir); `remove()` borraba en Cloudinary antes del delete de la property (fallo posterior → property viva con URLs rotas).
- Cambio aplicado: `update()` reordenado: subir nuevas → guardar property → recién ahí borrados irreversibles + portada. `remove()`: primero el delete en DB (el CASCADE limpia los registros de imágenes) y la limpieza de Cloudinary quedó al final, best-effort con Logger (si falla, la operación principal ya tuvo éxito).
- Estado: ✅ Corregido y verificado con npm run build

## [ratings] - Duplicados por carrera (sin constraint en DB)
- Fecha: 2026-07-19
- Archivo(s): `src/modules/ratings/entities/rating.entity.ts`, `src/modules/ratings/ratings.service.ts`
- Problema original: la unicidad usuario+propiedad dependía solo de un `findOne` con ventana de carrera — dos requests simultáneas creaban 2 ratings y el promedio contaba doble.
- Cambio aplicado: `@Unique(['userId', 'propertyId'])` en la entidad (verificado antes que la DB no tenía duplicados — synchronize la aplica al reiniciar) + captura de `isUniqueViolation` en el `save` → `ConflictException` 409 "Ya valoraste esta propiedad".
- Estado: ✅ Corregido y verificado con npm run build

## [favorites] - Carrera de favoritos duplicados → 500
- Fecha: 2026-07-19
- Archivo(s): `src/modules/favorites/favorites.service.ts`
- Problema original: dos POST simultáneos del mismo favorito pasaban el check `exists` y el segundo chocaba contra la PK compuesta como 500.
- Cambio aplicado: captura de `isUniqueViolation` en el `save` → `ConflictException` 409 "La propiedad ya está en favoritos" (mismo mensaje que el check previo).
- Estado: ✅ Corregido y verificado con npm run build

## [PropertyRequest] - Transiciones de estado ilegales
- Fecha: 2026-07-19
- Archivo(s): `src/modules/PropertyRequest/propertyRequest.service.ts`
- Problema original: cualquier estado podía pisar a cualquier otro (aprobar dos veces, volver de "aceptado" a "enviado").
- Cambio aplicado: mapa explícito `VALID_TRANSITIONS` — enviado → revisión/aceptado/rechazado; revisión → aceptado/rechazado; **aceptado es terminal**; rechazado → revisión (reconsiderar). Repetir el mismo estado tampoco es válido. Transición ilegal → `ConflictException` 409 "No se puede pasar la solicitud de 'X' a 'Y'".
- Estado: ✅ Corregido y verificado con npm run build

## [DTOs] - Negativos en PropertyRequest y password sin mínimo en CreateUserDto
- Fecha: 2026-07-19
- Archivo(s): `src/modules/PropertyRequest/dto/createRequestPropertyDto.ts`, `src/modules/users/dto/create-user.dto.ts`
- Problema original: `habitaciones`/`baños`/`antiguedad` aceptaban negativos; el password de `POST /users` no exigía largo mínimo (register sí pedía 5).
- Cambio aplicado: `@Min(0)` en los tres campos y `@MinLength(5)` en `password` de `CreateUserDto`, unificado con `RegisterDto`.
- Estado: ✅ Corregido y verificado con npm run build

## [users] - Cloudinary: 500 en foto de perfil y fallo post-borrado
- Fecha: 2026-07-19
- Archivo(s): `src/modules/users/users.service.ts`
- Problema original: si Cloudinary fallaba al subir la foto de perfil, el cliente veía un 500 genérico; y si fallaba la limpieza de la foto DESPUÉS de borrar un usuario, el cliente recibía error aunque el borrado ya había tenido éxito.
- Cambio aplicado: `updateProfilePhoto` → try/catch con Logger y **502** "No pudimos procesar la imagen, intentá de nuevo". `deleteUser` → limpieza best-effort en su propio try/catch que solo loguea.
- Estado: ✅ Corregido y verificado con npm run build

## [properties] - findAll con 400 en fallos internos y filtro status silencioso
- Fecha: 2026-07-19
- Archivo(s): `src/modules/properties/properties.service.ts`, `src/modules/properties/dto/property-filter.dto.ts`
- Problema original: el catch de `findAll()` respondía 400 para fallos de DB (semánticamente 500); `PropertyFilterDto.status` era `@IsString()` y un valor inválido devolvía lista vacía sin aviso.
- Cambio aplicado: `findAll` → Logger + `InternalServerErrorException` (mismo mensaje genérico); `status` → `@IsEnum(StatusProperty)` con mensaje que lista los valores permitidos (400 claro).
- Estado: ✅ Corregido y verificado con npm run build

## [Cloudinary/ImagesProperty] - destroy() silencioso y setAsCover sin guard
- Fecha: 2026-07-19
- Archivo(s): `src/common/Cloudinary/cloudinary.service.ts`, `src/modules/ImagesProperty/propertyImages.service.ts`
- Problema original: `destroy()` de Cloudinary devuelve `{ result: 'not found' }` sin lanzar — un borrado podía ser un no-op silencioso; `setAsCover()` accedía a `image.property.id` sin guard (TypeError → 500 con relación rota).
- Cambio aplicado: `deleteFile()` verifica `result === 'ok'` y loguea el no-op con `Logger.warn` (centralizado: beneficia a todos los callers); `setAsCover()` responde 404 "La imagen no tiene una propiedad asociada" si la relación falta.
- Estado: ✅ Corregido y verificado con npm run build

## [auth] - idToken sin DTO, login con 400 y DTOs muertos
- Fecha: 2026-07-19
- Archivo(s): `src/modules/auth/dto/google-login.dto.ts` (nuevo), `src/modules/auth/auth.controller.ts`, `src/modules/auth/auth.service.ts`, `src/modules/auth/dto/update-auth.dto.ts` (eliminado), `src/modules/auth/dto/create-google-user.dto.ts` (eliminado)
- Problema original: `@Body('idToken')` suelto sin validación (body vacío caía en el catch genérico); login fallido respondía 400 en vez de 401; dos DTOs sin ninguna referencia (verificado con grep: solo se referenciaban a sí mismos).
- Cambio aplicado: `GoogleLoginDto` con `@IsNotEmpty` ("El idToken de Google es obligatorio"); los 3 casos de login fallido pasan a `UnauthorizedException` **401** con el mismo mensaje genérico "Credenciales inválidas"; se eliminaron los 2 DTOs muertos.
- Estado: ✅ Corregido y verificado con npm run build

## [properties] - Campo agent quedaba null al crear
- Fecha: 2026-07-19
- Archivo(s): `src/modules/properties/properties.controller.ts`, `src/modules/properties/properties.service.ts`
- Problema original: `createWithImages()` nunca asignaba el `agent` — todas las properties quedaban sin agente vinculado (calidad de dato).
- Cambio aplicado: el controller pasa `@GetUser('id')` (el admin autenticado que crea) y el service asigna `property.agent` antes del save. Sin cambios de contrato para el frontend.
- Estado: ✅ Corregido y verificado con npm run build

## [properties] - Extensión "unaccent" de Postgres no garantizada
- Fecha: 2026-07-19
- Archivo(s): `src/common/bootstraps/bootstrap.service.ts` (nuevo método `ensurePostgresExtensions()`), `src/main.ts`
- Problema original: `PropertiesService.filter()` usa `unaccent(...)` en varios `ILIKE` (barrio, localidad, provincia, zone, búsqueda de texto libre). TypeORM no crea extensiones de Postgres — si nadie la activó a mano en una DB nueva, cualquier filtro de texto revienta con error SQL. Verificado (solo lectura, sin cambios): en la DB de desarrollo actual la extensión ya estaba instalada y el usuario de conexión (`postgres`) es superusuario, por eso el problema no se manifestó hasta ahora.
- Cambio aplicado: se agregó `ensurePostgresExtensions()` a `BootstrapService` (mismo lugar que `createDefaultAdmin()`, que ya corre en cada arranque desde `main.ts` y ya hace setup idempotente contra la DB) — corre `CREATE EXTENSION IF NOT EXISTS unaccent;` en cada boot. Se eligió este lugar en vez de un script de init aparte porque ya existe el patrón "tarea de bootstrap que corre sola al levantar la app" y no había que introducir uno nuevo. Si el usuario de la DB no tiene privilegios para crear extensiones (común en hosting gestionado), el error se loguea como warning y el arranque **continúa** (no es fatal como `JWT_SECRET`, porque acá degrada una funcionalidad puntual — el filtro de texto — no la seguridad de toda la app); documentado además como paso manual de setup en `CLAUDE.md` para ese escenario.
- Estado: ✅ Corregido y verificado con npm run build

## [properties] - Comparación de tipo de propiedad case-sensitive en la búsqueda NLP
- Fecha: 2026-07-19
- Archivo(s): `src/modules/properties/properties.service.ts`
- Problema original: en la detección de tipo dentro de `filter()` (búsqueda por texto libre), `qb.andWhere('type.name = :tName', ...)` comparaba exacto contra `property_types.name`, que es texto libre cargado por el admin (no un enum fijo) — si el admin cargó "Departamento" con mayúscula, la búsqueda `search="depto"` nunca matcheaba.
- Cambio aplicado: las 5 comparaciones (departamento, casa, local, oficina, baldío) pasaron de `= :tName` a `ILIKE :tName` — case-insensitive.
- Estado: ✅ Corregido y verificado con npm run build

## [properties] - NLP de habitaciones/baños pisaba filtros explícitos
- Fecha: 2026-07-19
- Archivo(s): `src/modules/properties/properties.service.ts`
- Problema original: los regex `roomsMatch`/`bathsMatch` dentro del parseo de `search` se aplicaban siempre, sin chequear si ya había un filtro explícito `rooms`/`bathrooms` en el DTO (a diferencia de la detección de tipo/operación, que sí tienen ese chequeo) — un `search="3 habitaciones"` + `rooms=2` generaba dos condiciones `AND` contradictorias → 0 resultados siempre.
- Cambio aplicado: se agregó el mismo patrón `!rooms` / `!bathrooms` que ya usaban tipo y operación — si el filtro explícito vino, el NLP no lo pisa.
- Estado: ✅ Corregido y verificado con npm run build
