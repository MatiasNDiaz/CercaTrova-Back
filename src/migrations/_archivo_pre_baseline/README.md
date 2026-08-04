# Migraciones previas al schema base (archivo histórico)

⚠️ **Estos archivos NO se ejecutan.** Están fuera del glob que leen
`typeorm.config.ts` y `data-source.ts` (`migrations/*.ts`, no recursivo), así que
TypeORM los ignora por completo. Se conservan solo como referencia.

## Qué pasó

Estas 4 migraciones eran **incrementales**: asumían que el schema base ya
existía, porque en desarrollo lo había creado `synchronize: true`. La primera
empezaba con:

```sql
ALTER TABLE "property" RENAME COLUMN "m2" TO "supTotal"
```

Contra una base de datos productiva nueva —donde `NODE_ENV=production` desactiva
`synchronize`— `npm run migration:run` fallaba en esa primera línea: no había
ninguna tabla `property` que alterar. El resultado era que **no existía forma de
crear el schema en producción**, aunque la app arrancara.

## Qué se hizo (2026-08-03)

Como el proyecto todavía no fue desplegado a producción, el historial de
migraciones no tenía ningún valor: no hay ninguna base productiva cuyo estado
haya que respetar. Se optó por **squash**, reemplazando las 4 por una única
migración base que crea todo el schema desde cero:

    src/migrations/1785731109084-InitialSchema.ts

Verificado sobre una base Postgres vacía real: `migration:run` termina sin error
y el schema resultante coincide **exactamente** con el que venía generando
`synchronize` en desarrollo (192 columnas, cero diferencias).

## Contenido archivado

| Archivo | Qué hacía |
|---|---|
| `1785186415891-AddPropertySurfaceAndLegalFields.ts` | `m2` → `supTotal`, y alta de `supCubierta`, `direccion`, `tractoAbreviado`, `boleto` en `property` y `search_preferences` |
| `1785206449494-AddPostsFeature.ts` | Tablas `posts`, `post_likes`, `post_comments` |
| `1785265872874-AddIsHiddenToComments.ts` | Columna `isHidden` en `comments` |
| `1785269135372-AddTrackingInfrastructure.ts` | Tablas `page_visits`, `property_views`, `filter_usages` con sus índices |

Todo eso está contemplado dentro de `InitialSchema`. Esta carpeta se puede
borrar sin ningún efecto sobre la aplicación.
