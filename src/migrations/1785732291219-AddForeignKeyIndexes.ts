import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Índices sobre las claves foráneas más consultadas.
 *
 * ## Por qué
 *
 * Postgres **no** crea índices automáticamente para las foreign keys (a
 * diferencia de MySQL), y ni `synchronize` ni las migraciones generadas lo
 * hacían. El resultado era que todas las tablas de relación tenían únicamente
 * su PK, y las consultas más calientes de la app hacían seq scan:
 *
 * · `notifications` — la campanita del frontend consulta `/unread-count` cada
 *   60 s por usuario conectado. Era un scan de la tabla entera cada vez.
 * · `property (status, created_at)` — el catálogo SIEMPRE filtra por status y
 *   ordena por created_at.
 * · `comments`, `ratings`, `favorites`, `property_images`, `post_comments` —
 *   además de las lecturas, sin índice cada CASCADE al borrar una propiedad o
 *   un usuario obliga a escanear la tabla hija completa.
 *
 * No se indexan `ratings.userId` ni `favorites.user_id`: ya quedan cubiertos
 * como prefijo del UNIQUE(userId, propertyId) y de la PK compuesta,
 * respectivamente.
 *
 * ## Nota de despliegue
 *
 * Son `CREATE INDEX` comunes, que **toman un lock de escritura** sobre cada
 * tabla mientras se construyen. Con el volumen actual (la tabla más grande son
 * ~1200 filas de `page_visits`) es instantáneo. Si en el futuro se corre sobre
 * tablas grandes y en caliente, conviene pasarlos a `CREATE INDEX CONCURRENTLY`
 * — que no puede ejecutarse dentro de una transacción, así que requeriría
 * correrlos fuera del runner de migraciones.
 */
export class AddForeignKeyIndexes1785732291219 implements MigrationInterface {
    name = 'AddForeignKeyIndexes1785732291219'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_6c9d2059f4ae253c262de11bba" ON "favorites" ("property_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_3b66fdbcc757c188252a265e4c" ON "ratings" ("propertyId") `);
        await queryRunner.query(`CREATE INDEX "IDX_7e8d7c49f218ebb14314fdb374" ON "comments" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_f4ec40620b24b0b818364cd74d" ON "comments" ("propertyId") `);
        await queryRunner.query(`CREATE INDEX "IDX_7a07b6b7f9418bf1d516010669" ON "property_images" ("propertyId") `);
        await queryRunner.query(`CREATE INDEX "IDX_1dd38d4ae26a2e578e3ceaa9eb" ON "property" ("status", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_35edb3cd2ee7e541ad706f2443" ON "notifications" ("targetRole", "read") `);
        await queryRunner.query(`CREATE INDEX "IDX_7bc9e59b16c014e6c9b0368ec1" ON "notifications" ("userId", "targetRole") `);
        await queryRunner.query(`CREATE INDEX "IDX_2f4fd3e12513addbc37a4e6d56" ON "post_comments" ("parentCommentId") `);
        await queryRunner.query(`CREATE INDEX "IDX_ac65d744abc05279aee0b29085" ON "post_comments" ("postId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_ac65d744abc05279aee0b29085"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2f4fd3e12513addbc37a4e6d56"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7bc9e59b16c014e6c9b0368ec1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_35edb3cd2ee7e541ad706f2443"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1dd38d4ae26a2e578e3ceaa9eb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7a07b6b7f9418bf1d516010669"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f4ec40620b24b0b818364cd74d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7e8d7c49f218ebb14314fdb374"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3b66fdbcc757c188252a265e4c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6c9d2059f4ae253c262de11bba"`);
    }

}
