import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Campo `type` en `notifications` + BACKFILL de las filas existentes.
 *
 * ## Por qué
 *
 * El frontend clasificaba las notificaciones buscando substrings del texto en
 * español ("Bajó el precio", "Solicitud aceptada"…). Cualquier cambio de
 * redacción —un acento, un emoji— rompía la clasificación en silencio. Con
 * `type` el texto queda libre y el frontend decide ícono/color/navegación por
 * un valor estable.
 *
 * ## ⚠️ Migración de DATOS, no solo de schema
 *
 * El `ALTER TABLE` deja todas las filas viejas en el default `'generica'`. El
 * bloque de UPDATEs las reclasifica a partir del título, que es exactamente la
 * heurística frágil que estamos eliminando — pero acá es correcta y aceptable
 * porque corre UNA sola vez, sobre un conjunto cerrado de filas ya escritas por
 * generadores conocidos.
 *
 * Los títulos del backfill se tomaron del inventario real de la base
 * (2026-08-03): 15 títulos distintos, 356 filas. El `LIKE 'Solicitud%'` +
 * `LIKE '¡Solicitud%'` cubre los 4 estados (recibida / en revisión /
 * aceptada 🎉 / rechazada).
 *
 * Si al correr esto en otro ambiente quedan filas en `'generica'`, son
 * notificaciones con un título que no estaba en el inventario: el frontend las
 * renderiza con el caso por defecto, no se rompe nada.
 */
export class AddNotificationType1785731953058 implements MigrationInterface {
    name = 'AddNotificationType1785731953058'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" ADD "type" character varying NOT NULL DEFAULT 'generica'`);

        // ── BACKFILL: feed del usuario ──
        await queryRunner.query(`UPDATE "notifications" SET "type" = 'propiedad_match'      WHERE "title" = '¡Propiedad que te puede interesar!'`);
        await queryRunner.query(`UPDATE "notifications" SET "type" = 'nueva_propiedad'      WHERE "title" = 'Nueva propiedad publicada'`);
        await queryRunner.query(`UPDATE "notifications" SET "type" = 'cambio_precio'        WHERE "title" = '¡Bajó el precio!'`);
        await queryRunner.query(`UPDATE "notifications" SET "type" = 'nueva_publicacion'    WHERE "title" = 'Nueva publicación'`);
        await queryRunner.query(`UPDATE "notifications" SET "type" = 'respuesta_comentario' WHERE "title" = 'Respondieron tu comentario'`);
        // Los 4 estados de solicitud comparten tipo: el estado concreto ya viaja
        // en el texto y en la solicitud referenciada.
        await queryRunner.query(`UPDATE "notifications" SET "type" = 'estado_solicitud'     WHERE "title" LIKE 'Solicitud%' OR "title" LIKE '¡Solicitud%'`);

        // ── BACKFILL: feed del admin ──
        await queryRunner.query(`UPDATE "notifications" SET "type" = 'admin_nuevo_usuario'          WHERE "title" = 'Nuevo usuario registrado'`);
        await queryRunner.query(`UPDATE "notifications" SET "type" = 'admin_nuevo_comentario'       WHERE "title" = 'Nuevo comentario en propiedad'`);
        await queryRunner.query(`UPDATE "notifications" SET "type" = 'admin_nueva_valoracion'       WHERE "title" = 'Nueva valoración en propiedad'`);
        await queryRunner.query(`UPDATE "notifications" SET "type" = 'admin_nueva_solicitud'        WHERE "title" = 'Nueva solicitud de publicación'`);
        await queryRunner.query(`UPDATE "notifications" SET "type" = 'admin_nuevo_favorito'         WHERE "title" = 'Propiedad guardada en favoritos'`);
        await queryRunner.query(`UPDATE "notifications" SET "type" = 'admin_comentario_publicacion' WHERE "title" = 'Nuevo comentario en una publicación'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // El backfill no necesita revertirse: la columna se va entera.
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "type"`);
    }

}
