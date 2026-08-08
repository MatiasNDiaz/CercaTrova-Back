import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Columna `order` en `property_images` — orden explícito de la galería.
 *
 * ## Por qué
 *
 * No existía ningún campo de orden: las imágenes salían del `leftJoinAndSelect`
 * sin `ORDER BY`, o sea en el orden que quisiera devolver Postgres. Lo único que
 * el admin podía elegir era la portada (`isCover`). Con esta columna el orden
 * completo se persiste y el drag & drop del formulario tiene dónde guardarse.
 *
 * ## ⚠️ Migración de DATOS, no solo de schema
 *
 * El `ADD COLUMN ... DEFAULT 0` dejaría TODAS las imágenes existentes empatadas
 * en `order = 0`, y una galería entera con el mismo orden es exactamente el
 * problema que esta columna viene a resolver. El backfill de abajo numera cada
 * galería 0..n-1 con `ROW_NUMBER()`:
 *
 *   - **Partición por propiedad**: cada propiedad arranca su propia secuencia
 *     desde 0, no una numeración global.
 *   - **`isCover DESC` primero**: la portada que el admin ya había elegido queda
 *     en la posición 0, respetando la invariante "`order = 0` ⇔ `isCover`" que
 *     documenta la entidad. Sin esto, una portada que fuera la 4ª foto más vieja
 *     terminaría en el medio de la galería y el catálogo mostraría una imagen
 *     distinta de la que abre el detalle.
 *   - **`id ASC` de desempate**: conserva el orden de subida entre las que no
 *     son portada, que es el orden que el admin venía viendo de hecho.
 *
 * `isCover DESC` funciona porque en Postgres `true > false`. Si alguna galería
 * quedó sin portada (estado que `ensureCoverExists()` evita, pero que existió
 * antes de ese guard), todas empatan en `false` y manda el `id ASC` — el mismo
 * criterio que usaba el código viejo. No hace falta un caso especial.
 *
 * El `down()` no necesita revertir el backfill: la columna se va entera.
 */
export class AddPropertyImageOrder1786190500000 implements MigrationInterface {
    name = 'AddPropertyImageOrder1786190500000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // "order" va entre comillas SIEMPRE: es palabra reservada de SQL.
        await queryRunner.query(`ALTER TABLE "property_images" ADD "order" integer NOT NULL DEFAULT 0`);

        // ── BACKFILL: numerar cada galería 0..n-1 ──
        await queryRunner.query(`
            UPDATE "property_images" AS pi
            SET "order" = numerada.pos
            FROM (
                SELECT
                    "id",
                    ROW_NUMBER() OVER (
                        PARTITION BY "propertyId"
                        ORDER BY "isCover" DESC, "id" ASC
                    ) - 1 AS pos
                FROM "property_images"
            ) AS numerada
            WHERE pi."id" = numerada."id"
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "property_images" DROP COLUMN "order"`);
    }

}
