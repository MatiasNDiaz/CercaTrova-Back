import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Tabla `post_media` — publicaciones con varias imágenes y/o videos.
 *
 * ## Antes
 *
 * Cada publicación tenía exactamente UNA imagen, en columnas propias de `posts`
 * (`imageUrl` NOT NULL, `imagePublicId` NOT NULL).
 *
 * ## Ahora
 *
 * Los medios viven en `post_media` (tipo, URL, `publicId` de Cloudinary, orden,
 * poster y dimensiones). `posts.imageUrl` se conserva como PORTADA
 * desnormalizada (la siguen leyendo el email de "nueva publicación" y el
 * OpenGraph), y `posts.imagePublicId` pasa a ser NULLABLE: una publicación que
 * es solo un video no tiene imagen propia.
 *
 * ## ⚠️ Compatibilidad — nada se borra
 *
 * - El backfill copia la imagen de cada publicación existente a `post_media`
 *   como medio #0 (`type = 'image'`). Las publicaciones viejas se ven igual y
 *   ya tienen galería sin intervención manual.
 * - `posts.imageUrl` e `imagePublicId` NO se tocan en esas filas: siguen
 *   teniendo los mismos valores. El código de borrado deduplica el
 *   `imagePublicId` legado contra `post_media`, así que la imagen no se intenta
 *   borrar dos veces de Cloudinary.
 * - `DROP NOT NULL` es la única alteración de una columna existente, y es
 *   ensanchar el dominio (todo valor que valía antes sigue valiendo).
 * - `ON CONFLICT DO NOTHING` en el backfill: correrla dos veces (o sobre una
 *   base donde `synchronize` ya creó la tabla y alguien cargó medios) no
 *   duplica ni falla por el UNIQUE de `publicId`.
 *
 * ## `down()`
 *
 * Borra `post_media` y vuelve a exigir `imagePublicId`. ⚠️ Si para entonces ya
 * hay publicaciones SOLO de video (con `imagePublicId` null), el `SET NOT NULL`
 * fallaría: el `down` primero les completa `imagePublicId` con el `publicId`
 * de su primer medio, para no dejar la base a mitad de camino. Las
 * publicaciones con varios medios pierden los extra en el `down` — es el costo
 * inevitable de volver a un modelo de una sola imagen.
 */
export class AddPostMedia1786190700000 implements MigrationInterface {
    name = 'AddPostMedia1786190700000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "post_media" ("id" SERIAL NOT NULL, "postId" integer NOT NULL, "type" character varying(10) NOT NULL, "url" text NOT NULL, "publicId" character varying NOT NULL, "order" integer NOT NULL DEFAULT '0', "posterUrl" text, "width" integer, "height" integer, "duration" double precision, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_efcf07bd408d3575c34862f1ed8" UNIQUE ("publicId"), CONSTRAINT "PK_049edb1ce7ab3d2a98009b171d0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5164186cdeaf2db9155c73753f" ON "post_media" ("postId", "order") `);
        await queryRunner.query(`ALTER TABLE "post_media" ADD CONSTRAINT "FK_4adcc5190e3b5c7e9001adef3b8" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

        await queryRunner.query(`ALTER TABLE "posts" ALTER COLUMN "imagePublicId" DROP NOT NULL`);

        // ── BACKFILL: la imagen de cada publicación existente pasa a ser su medio #0 ──
        await queryRunner.query(`
            INSERT INTO "post_media" ("postId", "type", "url", "publicId", "order", "createdAt")
            SELECT "id", 'image', "imageUrl", "imagePublicId", 0, "createdAt"
            FROM "posts"
            WHERE "imagePublicId" IS NOT NULL
            ON CONFLICT ("publicId") DO NOTHING
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Publicaciones creadas después de esta migración: completar el legado
        // con su primer medio antes de volver a exigirlo (ver docstring).
        await queryRunner.query(`
            UPDATE "posts" AS p
            SET "imagePublicId" = primero."publicId"
            FROM (
                SELECT DISTINCT ON ("postId") "postId", "publicId"
                FROM "post_media"
                ORDER BY "postId", "order" ASC, "id" ASC
            ) AS primero
            WHERE p."id" = primero."postId" AND p."imagePublicId" IS NULL
        `);
        await queryRunner.query(`ALTER TABLE "posts" ALTER COLUMN "imagePublicId" SET NOT NULL`);

        await queryRunner.query(`ALTER TABLE "post_media" DROP CONSTRAINT "FK_4adcc5190e3b5c7e9001adef3b8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5164186cdeaf2db9155c73753f"`);
        await queryRunner.query(`DROP TABLE "post_media"`);
    }

}
