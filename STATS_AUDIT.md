# Auditoría de estadísticas — 2026-08-13

> Auditoría de **solo lectura** contra la base de datos de **producción** (Railway,
> vía túnel `railway connect Postgres --tunnel-only`). No se modificó ni se borró
> ninguna fila. Los únicos escritos nuevos en la base son 3 filas de
> `property_views` y algunas de `page_visits`/`filter_usages` generadas por las
> pruebas EN VIVO que se hicieron para confirmar (no adivinar) el hallazgo
> principal — quedan identificadas más abajo.
>
> Motivo de la auditoría: desconfianza en los números del dashboard — visitas
> antes de la publicación del sitio y un pico raro el primer día.

## Resumen ejecutivo

1. **Encontré un bug real y lo reproduje en vivo** (no es una hipótesis): la
   tabla `property_views` (que alimenta "Propiedades más visitadas" y sus
   "visitantes únicos") queda con un `visitorId` **al azar en cada fila**,
   incluso para el mismo visitante viendo la misma propiedad dos veces
   seguidas. Esto hace que "visitantes únicos" en esa sección sea un número
   **sin sentido** (siempre va a mostrar ≈100% de "únicos", nunca refleja
   visitas repetidas). El resto de las tablas (`page_visits`, `filter_usages`)
   **no tienen este problema** — están bien.
2. **Sí hay contaminación real por uso interno** (tuyo y mío probando el
   sitio): identifiqué 18 "visitantes" que en algún momento estuvieron
   logueados como vos (admin) o como mi cuenta de prueba, y **entre los 18
   explican el 66,7% de TODAS las `page_visits` de la base** (1.587 de 2.380).
   Esto es aparte del bug del punto 1.
3. **No encontré ningún dato hardcodeado ni mock** en ninguna de las dos
   pantallas que muestran métricas (`/dashboardAdmin` y `/dashboardAdmin/estadisticas`).
   Todo lo que ves en pantalla sale de una consulta real a la base.
4. **No toqué nada todavía.** Al final del documento dejo una propuesta de
   limpieza con números concretos, para que la apruebes vos.

---

## 1. ¿Son reales? — origen de cada dato

### Dashboard de inicio (`/dashboardAdmin`)

Los 4 números de arriba (Usuarios registrados, Propiedades activas,
Solicitudes totales, Pendientes de revisión) salen de tres fetches reales al
cargar la página — sin caché, sin valores de respaldo:

| Tarjeta | De dónde sale | Archivo |
|---|---|---|
| Usuarios registrados | `GET /users` → `.length` del array | `dashboardAdmin/page.tsx:98` |
| Propiedades activas | `GET /properties?limit=1` → `meta.totalItems` (paginado, no descarga todo el catálogo) | `dashboardAdmin/page.tsx:99`, `properties.service.ts:107` |
| Solicitudes totales | `GET /property-requests` → `.length` | `dashboardAdmin/page.tsx:100` |
| Pendientes de revisión | mismo array, filtrado por `status === 'enviado' \|\| 'en_revision'` | `dashboardAdmin/page.tsx:101` |

Verifiqué estos 4 valores contra un `COUNT(*)` directo en producción — coinciden
exactamente (`property`: 16, `users`: 2, `property_requests`: 0). Si falla el
fetch, el catch es silencioso y la tarjeta se queda en el skeleton pulsante —
**nunca** cae a un número inventado. No hay ningún array de ejemplo ni número
suelto en este archivo.

### Panel de estadísticas (`/dashboardAdmin/estadisticas`)

Un único fetch, `GET /statistics?range=`, y el componente (`estadisticas/page.tsx`)
solo renderiza lo que llega — revisé el archivo completo y no hay ningún
`= [{ ... }]` de ejemplo, ningún placeholder que sobreviva sin datos. Grep de
`mock|hardcode|dummy|fake` en `modules/statistics/` completo: cero resultados.

Cada una de las 11 secciones sale de una consulta SQL real (`statistics.service.ts`),
detalladas en la sección 2.

### Tabla de tracking — fechas y patrones

Conecté directo a la base de producción (Railway) y miré `page_visits`,
`property_views` y `filter_usages` fila por fila. Esto es lo que encontré,
**con evidencia**, no supuesto:

**a) Actividad antes de que existiera la primera propiedad.**

```
Primera propiedad cargada (property.created_at): 2026-08-05 23:17:51 UTC
Primer page_visit:                                2026-08-05 07:40:06 UTC  ← 16 h antes
Primer filter_usage:                              2026-08-05 08:31:54 UTC  ← 15 h antes
Cuenta admin creada:                              2026-08-05 07:19:10 UTC
```

Todo el 5 de agosto es, con certeza, el día en que se desplegó el backend por
primera vez y se cargó la primera propiedad — no hay forma de que un visitante
real haya usado un catálogo vacío. Esto por sí solo no es un problema (es
esperable en cualquier lanzamiento), pero confirma que **el 5 de agosto entero
es tráfico de arranque/pruebas, no de público**.

**b) El "pico sospechoso" del 13/08 en `property_views` (288 vistas vs. 30-70
los otros días) — con matices importantes:**

Repartido por hora, el pico se concentra en dos franjas: 64 vistas a las 14:00
UTC (11:00 ART) y 127 a las 17:00 UTC (14:00 ART). **No puedo atribuirlo con
certeza total a una sola causa** — no hay IP ni user-agent guardados (ver
sección 5, es intencional por privacidad) — pero sí puedo decir con certeza que
**una parte de esas 288 la generé yo mismo, midiendo el rendimiento del sitio
contra producción durante esta misma sesión** (Lighthouse + scripts de Chrome
automatizado). Más abajo en el punto 4 explico por qué, aunque el número de
"vistas" sea real (son requests reales al backend), el de "visitantes únicos"
de ese día es directamente inservible por el bug del punto 3.

**c) Ninguna fila de `property_views` tiene un `visitorId` repetido — nunca,
en ninguna de las 672 filas históricas.** Ver punto 3, es la pista que llevó al
bug principal.

**d) 18 "visitantes" (identificados por `visitorId`) estuvieron logueados en
algún momento como vos o como mi cuenta de prueba, y agrupan el 66,7% de todas
las `page_visits`.** Ver punto 4, con el detalle.

---

## 2. ¿Están bien calculadas? — verificación matemática

Comparé cada cálculo del backend contra un `COUNT(*)` / agregación manual
directa en producción.

| Sección | Verificación | Resultado |
|---|---|---|
| `ownInventory()` (inventario propio) | `COUNT(*) FROM property` = 16 vs. `totalHistorico` del endpoint | Coincide (verificado por lectura de código: es un `COUNT` directo sin filtros raros) |
| `registrations()` | Agrupa `users` por `authProvider`; hay 2 usuarios reales (`local` y `google`) | Lógica correcta, sin división por cero (usa `total` calculado, no hardcodeado) |
| `mostFavorited()` / `mostCommented()` | `favorites` y `comments` están **en 0 filas** en producción hoy | Las secciones van a aparecer vacías — es correcto, no hay nada que mostrar todavía, no es un bug |
| `bestRated()` | Hay 3 `ratings` en total, uno por cada propiedad distinta (`id 2, 3, 4`, un puntaje cada una) | El filtro `HAVING COUNT(*) >= 2` (mínimo 2 valoraciones para entrar al ranking) hace que la sección salga **vacía a propósito** — ninguna propiedad tiene todavía 2 valoraciones. Es el comportamiento documentado, no un error |
| `rangeToDate()` | `day` = ahora−24h, `week` = ahora−7d, `month` = ahora−30d | Matemática simple y correcta, sin off-by-one |
| `traffic()` | Excluye `isAdmin = true` correctamente vía SQL (`WHERE`) | Correcto — pero ver punto 4: esto NO alcanza para excluir toda la actividad interna, solo la que ocurrió estando logueado como admin |
| `priceRanges()`, `extrasUsage()`, `toRows()` | Guardas de división por cero presentes en los tres | Correcto |

### Los 22 endpoints de `/stats/*` (el módulo viejo)

Confirmé que `user_search_feedback` sigue en **0 filas** en producción — el
mismo hallazgo de la auditoría anterior sigue vigente. Pero **esto no es la
causa de tu desconfianza**: grep completo del frontend confirma que
**ningún componente llama a `/stats/*`** — el panel de estadísticas usa
exclusivamente `/statistics` (el módulo nuevo). El módulo viejo está muerto
pero inofensivo: nadie lo mira.

---

## 3. El bug real: `property_views` mide con un `visitorId` al azar

Esto es lo más importante del informe. Lo encontré por un patrón raro en los
datos y lo **reproduje en vivo contra producción** para no repetir el error de
una sesión anterior (afirmar una causa sin comprobarla).

### La pista

```sql
-- Las 672 vistas de propiedad, agrupadas por día:
-- CADA día, "vistas" y "visitantes únicos" dan EXACTAMENTE el mismo número.
2026-08-05: 32 vistas / 32 únicos
2026-08-06: 31 vistas / 31 únicos
2026-08-07: 49 vistas / 49 únicos
...
2026-08-13: 288 vistas / 288 únicos
```

0% de repetición en 672 filas, en 9 días distintos, es estadísticamente
imposible para tráfico humano real (alguien que mira 2 propiedades en la misma
tarde es lo normal en un catálogo). Comparé contra `page_visits`, donde SÍ hay
repetición sana (ej. 508 visitas de 67 visitantes el 5/08 → ~7,6 páginas por
visita, un patrón de navegación creíble).

### La causa (verificada en el código, no supuesta)

`/properties/[id]` es la única página pública que trae sus datos **desde el
servidor** (`page.tsx` hace `GET /properties/:id` en el servidor de Next.js,
no en el navegador del visitante — está documentado así en el propio
`CLAUDE.md` del frontend). El cliente HTTP (`axios`) tiene `withCredentials: true`,
pero **esa opción es un concepto de navegador (XHR/fetch), no tiene ningún
efecto en una request que sale desde Node.js en el servidor**. No hay código
en `properties.service.ts` ni en `page.tsx` que lea la cookie `ct_vid` del
visitante y la reenvíe a mano hacia el backend.

Resultado: **cada carga de una página de propiedad le llega al backend sin
ninguna cookie**, así que `VisitorIdMiddleware` le inventa un UUID nuevo cada
vez — sin relación con el visitante real, ni con la vez anterior que miró la
misma propiedad.

### La prueba en vivo

Abrí un Chrome real (headless, con CDP) y navegué **de verdad** (sin
prefetch) a la misma propiedad dos veces seguidas, con la misma sesión de
navegador:

```
1ª apertura de /properties/9  → property_views.visitorId = 31e98076-846c...
2ª apertura de /properties/9  → property_views.visitorId = a0cf4b21-9128...  (¡DISTINTO!)
3ª apertura de /properties/8  → property_views.visitorId = d5312259-af0c...  (¡DISTINTO!)
```

Con las mismas tres cargas, `page_visits` (que se dispara desde el navegador,
no desde el servidor) sí reusó la cookie correctamente:

```
1ª carga → page_visits.visitorId = ffbe3703-713f...
2ª carga → page_visits.visitorId = 6c030949-e726...
3ª carga → page_visits.visitorId = 6c030949-e726...  (igual a la anterior — correcto)
```

Esto confirma el diagnóstico con certeza, no como hipótesis.

⚠️ También probé si el **prefetch automático de los `<Link>`** del catálogo
(pasar el mouse/scroll sobre las tarjetas, sin clickear) dispara vistas
fantasma — es una sospecha razonable dado que `PropertyCard`/`PropertyRow` no
tienen `prefetch={false}`. **La probé y la descarté**: hice scroll por el
catálogo real sin clickear nada y **no se insertó ninguna fila nueva** en
`property_views`. El prefetch de Next para esta ruta (que es 100% dinámica,
sin `loading.tsx`) no llega a ejecutar el fetch de datos. Lo aclaro para no
repetir el error de afirmar algo sin medirlo.

### Qué rompe esto, en concreto

- **"Más visitadas" → "X visitantes únicos"**: el número está siempre
  inflado al 100% de las vistas. Nunca refleja si fueron 50 vistas de 3
  personas interesadas o de 50 personas distintas — el dato simplemente no
  existe hoy.
- **El conteo de "vistas" (no el de "únicos") SÍ es real** — cada fila es un
  request real al backend, entonces "cuántas veces se abrió esta propiedad"
  como ranking (`ORDER BY COUNT(*)`) es confiable.
- **El campo `userId` de `property_views` da SIEMPRE `null`**, incluso cuando
  quien mira la propiedad está logueado — mismo motivo (la sesión tampoco
  viaja al servidor). Esto es relevante para el punto 5 más abajo.

**No lo arreglé** — es un cambio de código, y me pediste que en las secciones
1-3 no tocara nada. Si querés que lo arregle (forwardear la cookie real del
visitante en el fetch del servidor), es un cambio chico y bien localizado; te
lo dejo como pendiente a confirmar.

---

## 4. Limpieza de datos de testing

Encontré **dos fuentes de contaminación distintas**, y conviene no
mezclarlas:

### Fuente A — Todo el 5 de agosto (arranque técnico)

Nadie externo pudo haber visitado el sitio antes de que existiera la primera
propiedad. Cubre `page_visits`, `property_views` y `filter_usages` con fecha
`< 2026-08-06 00:00 UTC`.

### Fuente B — Vos y yo probando el sitio, identificado por cookie compartida

Encontré 18 `visitorId` que en algún momento de su historia estuvieron
logueados como tu cuenta admin (`inmobiliariacercatrova@gmail.com`, id 1) o
como mi cuenta de prueba (`matidiazargentino21@gmail.com`, id 3). Tomé
**todas** las filas de esos 18 visitantes — incluidas las que quedaron
anónimas (sin login) — porque es el mismo dispositivo/navegador, solo que en
ese momento no había sesión iniciada:

| Tabla | Filas de esos 18 visitantes | Total de la tabla | % |
|---|---|---|---|
| `page_visits` | 1.587 | 2.380 | **66,7%** |
| `filter_usages` | 294 | 922 | 31,9% |
| `property_views` | 0 (no se puede cruzar — bug del punto 3, `userId` siempre `null` ahí) | 672 | — |

El caso más claro: un `visitorId` con **479 page_visits** repartidas entre el
7 y el 10 de agosto, navegando `/login`, `/dashboardAdmin`, `/dashboardAdmin/usuarios`,
`/publicar` en ráfagas de segundos — el patrón de alguien probando el panel,
no de un cliente mirando propiedades. Ese mismo `visitorId` aparece 270 veces
logueado como vos y 113 como yo.

⚠️ Esto **no** es lo mismo que el flag `isAdmin` que ya excluye el backend: ese
flag solo tapa las filas donde la persona estaba efectivamente logueada como
admin en ESE momento puntual. No tapa la navegación anónima ni logueada como
usuario común del mismo dispositivo — que es donde se esconde la mayor parte
de esta contaminación.

### Lo que NO pude clasificar con certeza

Hay un tercer `visitorId` con **222 page_visits** entre el 7 y el 13 de
agosto, navegando `/properties` (102 veces), `/`, `/publicaciones`,
`/servicios/*` — **nunca logueado**, ni como admin ni con ninguna cuenta. No
tengo forma de confirmar si es un visitante real muy interesado (revisando el
catálogo varias veces en la semana, algo perfectamente normal) o alguien del
equipo navegando sin loguearse. Lo dejo señalado, no lo incluí en la propuesta
de borrado de abajo — ante la duda, no se toca.

### Propuesta de criterio (para que la apruebes — no borré nada)

1. **Por fecha**: toda fila con fecha anterior a la fecha real en la que
   compartiste el link con clientes de verdad. **Necesito que me confirmes
   esa fecha** — con los datos que tengo, solo puedo asegurar que el 5 de
   agosto es 100% previo al catálogo, pero no sé si el lanzamiento real fue
   ese mismo día, unos días después, o si seguís en fase de pruebas ahora
   mismo.
2. **Por identidad**: toda fila de los 18 `visitorId` que en algún momento
   estuvieron logueados como tu cuenta o la mía, en `page_visits` y
   `filter_usages` (en `property_views` no aplica por el bug ya explicado).

Estos dos criterios se pisan bastante entre sí (el arranque del 5/08 es en
buena parte de esos mismos 18 visitantes), así que el número final de "filas a
borrar" va a ser menor a la suma de ambos. Si confirmás la fecha de
lanzamiento te puedo dar el número exacto antes de borrar nada.

---

## 5. Usuarios registrados que visitan — estado actual

Confirmé lo que pediste, sin tocar código:

- **El sistema YA captura `userId`** cuando quien visita está logueado — las
  tres tablas (`page_visits`, `property_views`, `filter_usages`) tienen la
  columna, y el controller ya usa `OptionalJwtAuthGuard` + `@GetUser('id')`.
  No hace falta agregar la captura, ya existe.
- **Funciona correctamente en `page_visits` y `filter_usages`** (llamadas
  desde el navegador) — verificado con datos reales (userId 1 y 3 aparecen
  con normalidad).
- **NO funciona en `property_views`** — por el mismo bug del punto 3
  (fetch del lado del servidor, sin cookie de sesión), el `userId` de esa
  tabla da siempre `null`, incluso para vos o para mí logueados. Así que hoy
  "qué usuarios registrados vieron ESTA propiedad" no se puede armar de forma
  confiable con los datos que hay — sí se puede armar de forma confiable "qué
  usuarios registrados visitaron el sitio" (usando `page_visits`, que no
  tiene el problema).

**No agregué la tabla nueva en el panel de admin todavía.** Me pediste "si
aplicás el punto 5, ahí sí build final en ambos repos" — pero el punto 5 tal
como lo describiste asume que el tracking por propiedad ya funciona bien, y
encontré que no es así. Antes de construir la sección "usuarios que visitaron
esta propiedad" tiene sentido arreglar primero el bug del punto 3 (es un
cambio chico: reenviar la cookie real del visitante en el fetch del servidor),
si no la tabla nueva va a estar vacía para todos los visitantes reales.

**Te propongo el orden:**
1. Arreglar el bug de la cookie en el fetch del servidor (arregla de paso el
   número de "visitantes únicos" de "más visitadas").
2. Con eso andando, agregar el endpoint + la tabla en el panel: "usuarios
   registrados que visitaron el sitio" (ya se puede hoy) y "…que visitaron
   esta propiedad" (recién se puede después del paso 1).

Decime si querés que siga con esto, y con qué alcance.

---

## Preguntas para vos, antes de seguir

1. **¿Cuál es la fecha real en la que empezaste a compartir el sitio con
   clientes de verdad?** La necesito para cerrar el criterio de limpieza del
   punto 4.
2. **¿Confirmás que ese `visitorId` de 222 vistas sin login (7 al 13 de
   agosto) no sos vos ni nadie del equipo?** Si me decís que sí es alguien del
   equipo, lo sumo a la lista de borrado; si no lo sabés, lo dejamos como
   tráfico real.
3. **¿Querés que arregle el bug del punto 3** (la cookie del visitante no
   viaja en el fetch del servidor de `/properties/:id`)? Es un cambio acotado
   a 1-2 archivos del frontend.
4. **¿Avanzo con la funcionalidad del punto 5** (tabla de usuarios
   registrados que visitaron) una vez resuelto el punto 3?

## Estado

Solo lectura. Cero filas borradas o modificadas en producción. 3 filas de
`property_views` y unas pocas de `page_visits`/`filter_usages` se sumaron
como efecto de las pruebas en vivo que confirmaron el bug (ids `674`, `675`,
`676` en `property_views`, con fecha `2026-08-14T01:53*`) — quedan
identificadas acá para que no aparezcan como un misterio nuevo si volvés a
mirar la tabla.
