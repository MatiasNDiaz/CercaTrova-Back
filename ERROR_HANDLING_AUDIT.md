# AUDITORÍA DE MANEJO DE ERRORES Y VALIDACIONES — CercaTrova-Back

> Fecha: 2026-07-19 · **Solo diagnóstico y recomendación. NO se modificó ningún archivo de código.**
> Se audita el backend YA hardened (posterior a SECURITY_FIXES.md, SECURITY_FIXES_2.md y FEATURES.md).
> Prioridades: **ALTA** (confunde mucho al usuario o corrompe datos) · **MEDIA** (borde poco común) · **BAJA** (cosmético).

---

## RESUMEN EJECUTIVO

| Área | Hallazgos ALTA | Nota |
|---|---|---|
| **stats** | 4 | Endpoints que revientan con 500: columnas inexistentes (`city`, `antiquityMin`), SQL inválido (`120k`), y división por cero con DB vacía |
| **users** | 3 | Los `catch` filtran `error.message` de la DB al cliente; cambiar email a uno existente → 500 en vez de 409; usuario inexistente → 400 en vez de 404 |
| **ratings** | 1 | Valorar una property inexistente → 500 (FK), no se valida la referencia |
| **PropertyRequest** | 1 | `PATCH :id/status` sin validar el enum → 500 con estado inválido |
| **properties / ImagesProperty** | 1 | Fallo parcial de Cloudinary deja la property huérfana o imágenes inconsistentes (sin transacción) |
| **typeOfProperty** | 1 | Borrar un tipo referenciado por properties → 500 (FK) en vez de mensaje claro |

**Módulos en buen estado:** `favorites`, `search-preferences`, `comments` (salvo mensajes en inglés), `notifications`/`email` (reintentos F4 ya implementados), `requests` (UserSearchFeedback).

---

## auth

| Caso de fallo | Estado actual | HTTP rec. | Mensaje recomendado | Prioridad |
|---|---|---|---|---|
| Login con credenciales incorrectas | ✅ Manejado — `BadRequestException('Credenciales inválidas')` genérico (B1) | 401 | "Credenciales inválidas" (idealmente 401, hoy es 400) | BAJA |
| Login de cuenta que se registró con Google | ✅ Manejado — mensaje genérico "Credenciales inválidas" (B1) | 401 | Igual, sin revelar el método de registro | BAJA |
| Google: idToken de otra app (aud) | ✅ Manejado — `UnauthorizedException` (C7) | 401 | "El token no fue emitido para esta aplicación" | — |
| Google: email no verificado | ✅ Manejado — `UnauthorizedException` (C7) | 401 | "El email de la cuenta de Google no está verificado" | — |
| Google: `@Body('idToken')` ausente/vacío | Parcial — `verifyIdToken(undefined)` lanza y cae en el `catch` genérico → 400 | 400 | "El idToken de Google es obligatorio" (validarlo con un DTO en vez de `@Body('idToken')` suelto) | BAJA |
| Login/register con status HTTP semántico | Hoy todos los fallos de auth devuelven 400; login debería ser 401 | 401 | — | BAJA |
| `update-auth.dto.ts` / `create-google-user.dto.ts` | Aparentan ser código muerto (no referenciados por endpoints) | — | Confirmar y eliminar en una limpieza aparte | BAJA |

---

## users

| Caso de fallo | Estado actual | HTTP rec. | Mensaje recomendado | Prioridad |
|---|---|---|---|---|
| Cualquier error dentro de `createUser()` | ❌ El `catch` hace `throw new BadRequestException('No se pudo crear el usuario: ' + error.message)` → **filtra el mensaje interno de Postgres/TypeORM** al cliente, y además **re-envuelve** el `BadRequestException` genérico de email duplicado (B1) en "No se pudo crear el usuario: No se pudo completar el registro..." | 400 / 409 | No concatenar `error.message`. Loguear internamente y responder genérico. Dejar pasar las excepciones HTTP ya construidas (re-lanzar si `error instanceof HttpException`) | **ALTA** |
| `getAllUsers()` falla en la DB | ❌ `catch` concatena `error.message` → filtra detalle interno (solo ADMIN, pero igual) | 500 | Loguear internamente, responder "No se pudo obtener la lista de usuarios" sin el `error.message` | MEDIA |
| Buscar un usuario inexistente (`getUserById`) | ⚠️ Devuelve **400** (`BadRequestException('Usuario no encontrado')`) y encima su propio `catch` lo re-envuelve en "Error al buscar usuario: Usuario no encontrado". Usado por `getMe`, `PATCH /users/me`, PropertyRequest, search-preferences | 404 | `NotFoundException('Usuario no encontrado')` sin re-envolver | **ALTA** |
| Actualizar el email a uno que ya existe (`updateUser`) | ❌ No hay `catch`; la violación de constraint `unique` sale como **500** crudo. Afecta también a `PATCH /users/me` (F7) | 409 | "Ese email no está disponible" (sin revelar de quién es) — validar unicidad antes o capturar el error de constraint → 409 | **ALTA** |
| Actualizar un usuario inexistente (`updateUser`) | ⚠️ `BadRequestException` (400) | 404 | `NotFoundException('Usuario no encontrado')` | MEDIA |
| Subir foto y Cloudinary falla (`updateProfilePhoto`) | ⚠️ Se propaga como **500** genérico, sin mensaje útil | 502 | "No se pudo procesar la imagen, intentá de nuevo" | MEDIA |
| Borrar usuario y Cloudinary falla al limpiar la foto (`deleteUser`) | ⚠️ El usuario **ya se borró** de la DB, pero el fallo posterior de Cloudinary lanza 500 → el frontend cree que falló cuando en realidad se borró | 200 | Envolver el `deleteFile` en try/catch best-effort (no debe romper la operación ya completada) | MEDIA |
| Borrar un usuario inexistente | ⚠️ `BadRequestException` (400) | 404 | `NotFoundException` | BAJA |
| DTOs de entrada (`CreateUserDto`/`UpdateUserDto`) | ✅ Con validadores; `role` eliminado (C1), `isAdmin` eliminado (B7). Falta `@MinLength` en `password` de `CreateUserDto` (register sí lo tiene) | 400 | Agregar `@MinLength(5)` a `password` de `CreateUserDto` para igualar a `RegisterDto` | BAJA |

---

## properties

| Caso de fallo | Estado actual | HTTP rec. | Mensaje recomendado | Prioridad |
|---|---|---|---|---|
| Crear/actualizar con datos inválidos | ✅ Manejado — `JsonToDtoPipe` valida el DTO real (M4) | 400 | Detalle de class-validator | — |
| Crear con `typeOfPropertyId` inexistente | ✅ Manejado en `createWithImages` → `NotFoundException` | 404 | "No existe el tipo de propiedad con ID X" | — |
| **Actualizar** con `typeOfPropertyId` inexistente | ❌ `update()` hace `Object.assign(property, dto)` sin re-validar el tipo → violación de FK → **500** | 404 | Validar el tipo antes de `save`, igual que en `create` | MEDIA |
| Cloudinary falla al subir imágenes en `create` | ❌ La property **ya fue guardada** (`save` en el paso 1) antes de subir; si la subida falla, queda una **property huérfana sin imágenes** y el cliente ve 500 | 502 | Envolver crear-property + subir-imágenes en una transacción, o borrar la property si la subida falla. Mensaje: "No se pudieron procesar las imágenes" | **ALTA** |
| Cloudinary falla durante `update` (borra imágenes viejas y luego falla) | ❌ `deleteManyByIds` borra en Cloudinary+DB **antes** de guardar el resto; si un paso posterior falla, las imágenes ya se borraron irreversiblemente | 502 | Ordenar para que los borrados irreversibles sean lo último, o usar transacción | MEDIA |
| `remove()` borra imágenes de Cloudinary y luego falla el delete de la property | ⚠️ Imágenes borradas pero property persiste con URLs rotas | 500 | Transacción o borrar la property primero | MEDIA |
| `findAll()` falla en la DB | ⚠️ `catch` genérico → `BadRequestException('No se pudieron obtener las propiedades')` (400, debería ser 500; oculta el error real, que está OK) | 500 | Mantener el mensaje genérico pero como 500 | BAJA |
| Filtrar por `status` con un valor no-enum | ⚠️ `PropertyFilterDto.status` es `@IsString()` (no `@IsEnum`) → acepta cualquier string, devuelve lista vacía sin error | 200 | Cambiar a `@IsEnum(StatusProperty)` para feedback 400 claro | BAJA |
| Property creada sin `agent` asignado | ⚠️ `createWithImages` no setea `agent` → queda null (calidad de dato, no error) | — | Asignar el agente (del token o del DTO) al crear | MEDIA |

---

## ImagesProperty

| Caso de fallo | Estado actual | HTTP rec. | Mensaje recomendado | Prioridad |
|---|---|---|---|---|
| Subir imagen a Cloudinary y falla (`createMany`) | ❌ Sin try/catch → 500; y deja la property huérfana (ver properties) | 502 | "No se pudo procesar la imagen" | **ALTA** (mismo caso que properties.create) |
| `deleteFile` de Cloudinary no confirma resultado | ⚠️ `destroy()` devuelve `{ result: 'not found' }` sin lanzar → un borrado puede ser un no-op silencioso | — | Verificar `result.result === 'ok'` y loguear si no | BAJA |
| Borrar/set-cover de imagen inexistente | ✅ Manejado — `NotFoundException('Imagen no encontrada')` | 404 | — | — |
| `setAsCover` con `image.property` null | ⚠️ `image.property.id` podría reventar si la relación está rota | 500 | Guardar contra `property` null | BAJA |
| Uploads (tipo/tamaño) | ✅ Manejado — `imageUploadOptions` (5MB, solo `image/*`) (M12) | 400 | — | — |

---

## typeOfProperty

| Caso de fallo | Estado actual | HTTP rec. | Mensaje recomendado | Prioridad |
|---|---|---|---|---|
| Crear un tipo con nombre duplicado | ✅ Manejado — `ConflictException('Ese tipo de propiedad ya existe.')` | 409 | — | — |
| **Borrar un tipo referenciado por properties** | ❌ La relación `@ManyToOne` en Property (eager) genera una FK; borrar un tipo en uso → violación de FK → **500** crudo | 409 | Chequear si hay properties usando el tipo antes de borrar → "No se puede eliminar: hay propiedades usando este tipo" | **ALTA** |
| Buscar/actualizar/borrar tipo inexistente | ✅ Manejado — `NotFoundException` | 404 | — | — |
| Carrera al crear el mismo nombre 2 veces | ⚠️ TOCTOU entre el `findOne` y el `save`; la constraint `unique` lo frena pero como 500 | 409 | Capturar el error de constraint → 409 | BAJA |

---

## favorites

| Caso de fallo | Estado actual | HTTP rec. | Mensaje recomendado | Prioridad |
|---|---|---|---|---|
| Favoritear con usuario/property inexistente | ✅ Manejado — `NotFoundException` (B2) | 404 | — | — |
| Favorito duplicado | ✅ Manejado — `ConflictException` (B2) + PK compuesta protege el dato | 409 | — | — |
| Carrera: dos POST simultáneos del mismo favorito | ⚠️ TOCTOU entre el check `exists` y el `save`; la PK compuesta evita el duplicado pero el 2.º sale como **500** en vez de 409 | 409 | Capturar la violación de PK → `ConflictException` | MEDIA |
| `CreateFavoriteDto` sin validadores | ⚠️ El DTO no tiene decoradores, pero ya **no se usa como `@Body`** (el controller arma el objeto desde el token, C5) → sin riesgo | — | Informativo | BAJA |

---

## ratings

| Caso de fallo | Estado actual | HTTP rec. | Mensaje recomendado | Prioridad |
|---|---|---|---|---|
| **Valorar una property inexistente** | ❌ `rateProperty` crea el rating con `property: { id: propertyId }` **sin validar** que exista → violación de FK → **500** | 404 | Validar que la property exista antes de guardar → "No existe la propiedad indicada" | **ALTA** |
| Score fuera de rango | ✅ Manejado — DTO `@IsInt() @Min(1) @Max(5)` (B5) + check redundante en el service | 400 | — | — |
| Carrera: dos valoraciones simultáneas del mismo usuario a la misma property | ⚠️ TOCTOU en el `findOne(existingRating)`; sin constraint `unique(userId, propertyId)` en la DB → pueden crearse **2 ratings duplicados** → el promedio los cuenta doble | 409 / — | Agregar constraint `unique` en (userId, propertyId) y capturarla | MEDIA |
| Valorar con userId inexistente | ❌ No se valida (el user viene del token validado por JwtStrategy, así que en la práctica existe) → si no, FK 500 | 404 | Cubierto indirectamente por el punto anterior | BAJA |

---

## comments

| Caso de fallo | Estado actual | HTTP rec. | Mensaje recomendado | Prioridad |
|---|---|---|---|---|
| Comentar en property inexistente | ✅ Manejado — `NotFoundException('Property not found')` | 404 | — | — |
| Editar/borrar comentario ajeno | ✅ Manejado — `ForbiddenException` | 403 | — | — |
| Comentario inexistente | ✅ Manejado — `NotFoundException` | 404 | — | — |
| **Mensajes de error en inglés** | ⚠️ "Property not found", "User not found", "Comment not found", "You cannot edit a comment that is not yours" — rompen la convención de español (CLAUDE.md) y se muestran al usuario | — | Traducir a español: "La propiedad no existe", "No podés editar un comentario que no es tuyo", etc. | BAJA |
| DTO del mensaje | ✅ `@IsString() @IsNotEmpty() @MaxLength(500)` — bien | 400 | — | — |

---

## notifications (+ email)

| Caso de fallo | Estado actual | HTTP rec. | Mensaje recomendado | Prioridad |
|---|---|---|---|---|
| Marcar como leída una notificación ajena | ✅ Manejado — `WHERE id AND userId` + 404 si no afecta filas (M6) | 404 | — | — |
| SendGrid falla al enviar | ✅ Manejado — 3 reintentos con backoff + registro en `failed_emails` (F4); la notificación in-app se persiste antes | — | — | — |
| Fallo de email en broadcast/precio | ✅ Capturado y logueado, no rompe la request (background + `.catch`) | — | — | — |
| Marcar como leída una ya leída | ⚠️ No se rechaza (idempotente, es aceptable) — no es un estado ilegal real | 200 | Sin cambios | BAJA |
| `CreateNotificationDto` sin `@IsNotEmpty`/`@MaxLength` | ⚠️ `title`/`message` aceptan vacío o texto enorme — pero **no hay endpoint público** que lo use (las notificaciones se crean internamente) | — | Informativo; endurecer si se expone alguna vez | BAJA |

---

## search-preferences

| Caso de fallo | Estado actual | HTTP rec. | Mensaje recomendado | Prioridad |
|---|---|---|---|---|
| Crear preferencia con usuario inexistente | ✅ Manejado — `NotFoundException` (B2) | 404 | — | — |
| Crear/actualizar con `typeOfPropertyId` inexistente | ✅ Manejado — `NotFoundException` | 404 | — | — |
| `update` cuando no hay preferencia previa | ✅ Manejado — hace upsert (crea) | — | — | — |
| `getByUser` sin preferencias | ⚠️ Devuelve `null` con 200 → el frontend debe contemplar el null | 200 | Documentar; opcionalmente devolver `{}` o 204 | BAJA |
| DTO | ✅ Validadores completos con `@Min`, `@IsEnum`, etc. | 400 | — | — |

---

## PropertyRequest

| Caso de fallo | Estado actual | HTTP rec. | Mensaje recomendado | Prioridad |
|---|---|---|---|---|
| **`PATCH :id/status` con un estado inválido** | ❌ `@Body('status')` es un **string crudo sin DTO ni `@IsEnum`**; el service lo asigna a una columna `enum` de Postgres → valor ilegal → **500** | 400 | DTO con `@IsEnum(RequestStatus)` → "Estado inválido. Valores permitidos: enviado, en_revision, aceptado, rechazado" | **ALTA** |
| Transición de estado ilegal (aceptar dos veces, volver a ENVIADO) | ❌ No hay reglas de transición; cualquier estado pisa al anterior | 409 | Validar transiciones permitidas → "No se puede pasar de 'aceptado' a 'enviado'" | MEDIA |
| `tipoPropiedad` / `tipoOperacion` / `estadoConservacion` como texto libre | ⚠️ El DTO los valida como `@IsString()` sin enum → se guardan valores arbitrarios (inconsistente con las stats y con Property, que sí usan enum) | 400 | Usar `@IsEnum(...)` para estos 3 campos | MEDIA |
| `habitaciones` / `baños` / `antiguedad` negativos | ⚠️ `@IsNumber()` sin `@Min(0)` → acepta negativos | 400 | Agregar `@Min(0)` | BAJA |
| Ver/editar solicitud ajena | ✅ Manejado — `findMyOne` valida ownership → `ForbiddenException`; rutas admin con `RolesGuard` | 403 | — | — |
| Solicitud inexistente | ✅ Manejado — `NotFoundException` | 404 | — | — |

---

## requests (UserSearchFeedback)

| Caso de fallo | Estado actual | HTTP rec. | Mensaje recomendado | Prioridad |
|---|---|---|---|---|
| Envío dentro de la ventana anti-spam (24h) | ✅ Manejado — `BadRequestException` con mensaje claro en español | 429 | El mensaje es bueno; el código ideal sería 429 en vez de 400 | BAJA |
| `deviceId` ausente o no-UUID | ✅ Manejado — DTO `@IsUUID('4')` + check redundante en el controller | 400 | — | — |
| Feedback inexistente por ID (admin) | ✅ Manejado — `NotFoundException` | 404 | — | — |
| Carrera: dos envíos simultáneos con el mismo `deviceId` | ⚠️ TOCTOU en el check de "reciente"; sin constraint, ambos pueden guardarse | — | Aceptable (anti-spam es best-effort; el `deviceId` lo controla el cliente de todos modos) | BAJA |

---

## stats

> Todo el controller es solo-ADMIN (M3). Estos hallazgos rompen el **dashboard del admin**: son consultas que hoy revientan con 500.

| Caso de fallo | Estado actual | HTTP rec. | Mensaje recomendado | Prioridad |
|---|---|---|---|---|
| **`GET /stats/cities` (`demandByCity`)** | ❌ Selecciona `"u"."city"`, columna que **no existe** en `UserSearchFeedback` (tiene `localidad`, no `city`) → error SQL → **500** | 500→200 | Corregir a `localidad`. Es un bug latente, no falta de manejo | **ALTA** |
| **`GET /stats/antiquity/average` (`averageAntiquity`)** | ❌ Referencia `"u"."antiquityMin"`, columna **inexistente** (solo hay `antiquityMax`) → **500** | 500→200 | Corregir las columnas | **ALTA** |
| **`GET /stats/antiquity/new-construction` (`newConstructionInterest`)** | ❌ Mismo problema: usa `antiquityMin` inexistente → **500** | 500→200 | Corregir | **ALTA** |
| **`GET /stats/price/ranges` (`priceRanges`)** | ❌ SQL con literales inválidos `BETWEEN 120k AND 200k` (`120k`/`200k` no son números SQL) → error de sintaxis → **500** | 500→200 | Usar `120000`/`200000` | **ALTA** |
| **División por cero con DB vacía** | ❌ Casi todas las queries de porcentaje dividen por `${total}` (= `count()`); con la tabla vacía (`total = 0`) → división por cero → **500**. Un admin que abre el dashboard sin datos ve todo roto | 500→200 | `if (total === 0) return []` / devolver ceros antes de dividir | **ALTA** |
| `${total}` interpolado en el SQL | ✅ Es un número de `.count()`, no inyectable | — | Informativo (igual conviene parametrizar) | BAJA |

---

## TOP 10 RECOMENDACIONES (ordenadas por impacto en la experiencia)

1. **stats — arreglar los 5 casos que devuelven 500 (dashboard admin roto).** Columnas inexistentes (`city`→`localidad`, `antiquityMin`), SQL inválido (`120k`→`120000`) y división por cero con DB vacía. Es lo primero que ve un admin y hoy revienta. **[ALTA]**

2. **users — dejar de filtrar `error.message` en los `catch` de `UsersService`.** `createUser`/`getAllUsers`/`getUserById` concatenan el error crudo de Postgres/TypeORM en la respuesta (fuga de detalle interno) y re-envuelven excepciones ya construidas, ensuciando incluso el mensaje anti-enumeración de B1. Loguear internamente, responder genérico, y re-lanzar si `error instanceof HttpException`. **[ALTA — además es un tema de seguridad]**

3. **users — cambiar el email a uno ya existente devuelve 500 en vez de 409.** Afecta `PATCH /users/:id` y `PATCH /users/me`. Capturar la violación de constraint `unique` y responder 409 "Ese email no está disponible" (sin revelar de quién es). **[ALTA]**

4. **ratings — validar que la property exista antes de guardar la valoración.** Hoy valorar una property inexistente revienta con 500 por FK. Debe ser un 404 claro. Es una acción común de usuario. **[ALTA]**

5. **PropertyRequest — validar el estado en `PATCH :id/status` con un DTO `@IsEnum(RequestStatus)`.** Hoy `@Body('status')` acepta cualquier string y el enum de Postgres lo rechaza con 500. Un admin cambiando el estado desde el panel puede toparse con esto. **[ALTA]**

6. **properties / ImagesProperty — evitar la property huérfana ante fallo de Cloudinary.** Al crear, la property se guarda antes de subir las imágenes; si Cloudinary falla queda una property sin fotos y el cliente ve 500. Envolver en transacción o hacer rollback de la property. Integridad de datos. **[ALTA]**

7. **users — usuario inexistente debe ser 404, no 400.** `getUserById`/`updateUser`/`deleteUser` responden 400 (y a veces con el mensaje re-envuelto). Se usa en muchísimos flujos (`/auth/me`, perfil, PropertyRequest). Un 404 correcto ayuda al frontend a distinguir "no existe" de "datos inválidos". **[ALTA]**

8. **typeOfProperty — borrar un tipo en uso debe dar 409 con mensaje, no 500.** Chequear si hay properties usando el tipo antes de borrar y responder "No se puede eliminar: hay propiedades usando este tipo". Hoy el admin ve un 500 sin explicación. **[ALTA]**

9. **properties — validar `typeOfPropertyId` también en `update` (no solo en create).** Hoy actualizar con un tipo inexistente revienta con 500 por FK; debería ser 404. **[MEDIA, alto valor]**

10. **PropertyRequest & comments — consistencia de datos y de idioma.** (a) Usar `@IsEnum` en `tipoPropiedad`/`tipoOperacion`/`estadoConservacion` (hoy texto libre → datos inconsistentes con las stats). (b) Traducir al español los mensajes de error de `comments` (hoy en inglés, visibles al usuario). Mejoran la coherencia percibida del producto. **[MEDIA / BAJA]**

---

## COSAS QUE VI Y NO TOQUÉ (tentaciones anotadas, no arregladas)

Siguiendo la consigna de solo-lectura, dejo anotado esto que "daban ganas de arreglar de una":

- **`ClassSerializerInterceptor` no está registrado globalmente** (`main.ts` solo tiene `ValidationPipe`). Por eso el `@Exclude()` sobre `PropertyImages.property` **no hace nada** — la relación `property` podría filtrarse en las respuestas de imágenes. No es manejo de errores (es exposición de datos), pero conviene revisarlo en una tanda de seguridad aparte. El password ya está cubierto por `select: false` (C8), así que el impacto real es menor.
- **Falta constraint `unique(userId, propertyId)` en `ratings`** a nivel DB — hoy la unicidad depende de un `findOne` con ventana de carrera.
- **Properties se crean sin `agent` asignado** — calidad de dato, no error.
- **`update-auth.dto.ts` y `create-google-user.dto.ts`** parecen código muerto.
- Varios `catch` usan `BadRequestException` (400) para casos que semánticamente son 404/409/429/502 — están listados arriba módulo por módulo.

> **Recordatorio:** este documento es 100% diagnóstico. No se modificó código, no se instaló nada, no se corrió `npm run build`. Cada arreglo propuesto debería aplicarse en una sesión de trabajo separada, con su verificación correspondiente.
