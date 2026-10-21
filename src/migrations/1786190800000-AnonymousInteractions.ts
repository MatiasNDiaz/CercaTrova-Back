import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Interacciones sin iniciar sesión: comentarios, "me gusta" y calificaciones
 * de VISITANTES anónimos.
 *
 * ## Qué cambia
 *
 * - `comments`, `post_comments`, `ratings`: `userId` pasa a NULLABLE (NULL =
 *   visitante) y se agregan `visitorId` (cookie anónima `ct_vid`, UUID) e
 *   `ipHash` (SHA-256 de la IP con sal — la IP nunca se guarda). Los
 *   comentarios suman `guestName` (opcional, ≤50).
 * - `ratings`: una calificación por visitante y propiedad (índice único
 *   PARCIAL sobre las filas anónimas) + `CHECK (score BETWEEN 1 AND 5)`.
 * - `post_likes`: la PK compuesta (user_id, post_id) no admite NULL, así que se
 *   reemplaza por un `id` serial y la unicidad pasa a dos índices únicos
 *   parciales (uno para registrados, otro para visitantes) + índice por post.
 *
 * ## ⚠️ Compatibilidad — nada se borra
 *
 * - Todos los cambios ensanchan: columnas nuevas NULLABLE, `DROP NOT NULL`.
 *   Las filas existentes quedan intactas y siguen asociadas a su usuario.
 * - En `post_likes`, `ADD "id" SERIAL` numera las filas existentes solo. La PK
 *   vieja se cambia por la nueva y el índice único parcial de registrados
 *   reproduce exactamente la garantía que daba (un like por usuario y post).
 * - El `CHECK` de score se agrega sobre datos que ya cumplían 1..5 (el DTO lo
 *   validaba desde siempre). Si hubiera alguna fila fuera de rango, la
 *   migración fallaría ANTES de cambiar nada (corre en una transacción).
 *
 * ## `down()`
 *
 * Revierte el schema. ⚠️ Antes BORRA las interacciones anónimas (no tienen
 * usuario y las columnas vuelven a ser NOT NULL): es el costo inevitable de
 * volver al modelo "solo usuarios registrados".
 */
export class AnonymousInteractions1786190800000 implements MigrationInterface {
    name = 'AnonymousInteractions1786190800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── Comentarios de propiedades ──
        await queryRunner.query(`ALTER TABLE "comments" ALTER COLUMN "userId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "comments" ADD "guestName" character varying(50)`);
        await queryRunner.query(`ALTER TABLE "comments" ADD "visitorId" character varying(36)`);
        await queryRunner.query(`ALTER TABLE "comments" ADD "ipHash" character varying(64)`);

        // ── Comentarios de publicaciones ──
        await queryRunner.query(`ALTER TABLE "post_comments" ALTER COLUMN "userId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "post_comments" ADD "guestName" character varying(50)`);
        await queryRunner.query(`ALTER TABLE "post_comments" ADD "visitorId" character varying(36)`);
        await queryRunner.query(`ALTER TABLE "post_comments" ADD "ipHash" character varying(64)`);

        // ── Calificaciones ──
        await queryRunner.query(`ALTER TABLE "ratings" ALTER COLUMN "userId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "ratings" ADD "visitorId" character varying(36)`);
        await queryRunner.query(`ALTER TABLE "ratings" ADD "ipHash" character varying(64)`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b73e69bd27140e2cc1759357a7" ON "ratings" ("visitorId", "propertyId") WHERE "userId" IS NULL`);
        await queryRunner.query(`ALTER TABLE "ratings" ADD CONSTRAINT "CHK_1f8fdfe99f58838dd4397805e9" CHECK ("score" BETWEEN 1 AND 5)`);

        // ── "Me gusta" de publicaciones ──
        await queryRunner.query(`ALTER TABLE "post_likes" ADD "id" SERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "post_likes" DROP CONSTRAINT "PK_8f64693922a9e8c4e2605850d0b"`);
        await queryRunner.query(`ALTER TABLE "post_likes" ADD CONSTRAINT "PK_e4ac7cb9daf243939c6eabb2e0d" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "post_likes" ALTER COLUMN "user_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "post_likes" ADD "visitor_id" character varying(36)`);
        await queryRunner.query(`ALTER TABLE "post_likes" ADD "ip_hash" character varying(64)`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_5d2f890aab934303d491b67801" ON "post_likes" ("user_id", "post_id") WHERE "user_id" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_6cced2178e49bd17a2c78f233e" ON "post_likes" ("visitor_id", "post_id") WHERE "user_id" IS NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_b40d37469c501092203d285af8" ON "post_likes" ("post_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Las filas anónimas no pueden volver a un esquema con userId NOT NULL.
        await queryRunner.query(`DELETE FROM "post_likes" WHERE "user_id" IS NULL`);
        await queryRunner.query(`DELETE FROM "ratings" WHERE "userId" IS NULL`);
        await queryRunner.query(`DELETE FROM "post_comments" WHERE "userId" IS NULL`);
        await queryRunner.query(`DELETE FROM "comments" WHERE "userId" IS NULL`);

        await queryRunner.query(`DROP INDEX "public"."IDX_b40d37469c501092203d285af8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6cced2178e49bd17a2c78f233e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5d2f890aab934303d491b67801"`);
        await queryRunner.query(`ALTER TABLE "post_likes" DROP COLUMN "ip_hash"`);
        await queryRunner.query(`ALTER TABLE "post_likes" DROP COLUMN "visitor_id"`);
        await queryRunner.query(`ALTER TABLE "post_likes" ALTER COLUMN "user_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "post_likes" DROP CONSTRAINT "PK_e4ac7cb9daf243939c6eabb2e0d"`);
        await queryRunner.query(`ALTER TABLE "post_likes" ADD CONSTRAINT "PK_8f64693922a9e8c4e2605850d0b" PRIMARY KEY ("user_id", "post_id")`);
        await queryRunner.query(`ALTER TABLE "post_likes" DROP COLUMN "id"`);

        await queryRunner.query(`ALTER TABLE "ratings" DROP CONSTRAINT "CHK_1f8fdfe99f58838dd4397805e9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b73e69bd27140e2cc1759357a7"`);
        await queryRunner.query(`ALTER TABLE "ratings" DROP COLUMN "ipHash"`);
        await queryRunner.query(`ALTER TABLE "ratings" DROP COLUMN "visitorId"`);
        await queryRunner.query(`ALTER TABLE "ratings" ALTER COLUMN "userId" SET NOT NULL`);

        await queryRunner.query(`ALTER TABLE "post_comments" DROP COLUMN "ipHash"`);
        await queryRunner.query(`ALTER TABLE "post_comments" DROP COLUMN "visitorId"`);
        await queryRunner.query(`ALTER TABLE "post_comments" DROP COLUMN "guestName"`);
        await queryRunner.query(`ALTER TABLE "post_comments" ALTER COLUMN "userId" SET NOT NULL`);

        await queryRunner.query(`ALTER TABLE "comments" DROP COLUMN "ipHash"`);
        await queryRunner.query(`ALTER TABLE "comments" DROP COLUMN "visitorId"`);
        await queryRunner.query(`ALTER TABLE "comments" DROP COLUMN "guestName"`);
        await queryRunner.query(`ALTER TABLE "comments" ALTER COLUMN "userId" SET NOT NULL`);
    }

}
