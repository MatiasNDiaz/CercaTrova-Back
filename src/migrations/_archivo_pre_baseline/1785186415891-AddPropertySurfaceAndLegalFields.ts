import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Superficies (total / cubierta) + documentación legal en Property.
 *
 * ⚠️ El `migration:generate` original resolvía el rename de `m2` como
 * DROP + ADD, lo que borraba los valores ya cargados. Acá se reemplaza por un
 * RENAME COLUMN real, que preserva los datos existentes tanto en `property`
 * como en `search_preferences`.
 */
export class AddPropertySurfaceAndLegalFields1785186415891 implements MigrationInterface {
    name = 'AddPropertySurfaceAndLegalFields1785186415891'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // --- Renames que preservan los datos ya cargados ---
        await queryRunner.query(`ALTER TABLE "property" RENAME COLUMN "m2" TO "supTotal"`);
        await queryRunner.query(`ALTER TABLE "search_preferences" RENAME COLUMN "m2" TO "supTotal"`);

        // --- Columnas nuevas en property ---
        await queryRunner.query(`ALTER TABLE "property" ADD "supCubierta" integer`);
        await queryRunner.query(`ALTER TABLE "property" ADD "direccion" character varying`);
        await queryRunner.query(`ALTER TABLE "property" ADD "tractoAbreviado" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "property" ADD "boleto" boolean NOT NULL DEFAULT false`);

        // --- Columnas nuevas en search_preferences (mismos criterios de búsqueda) ---
        await queryRunner.query(`ALTER TABLE "search_preferences" ADD "supCubierta" integer`);
        await queryRunner.query(`ALTER TABLE "search_preferences" ADD "tractoAbreviado" boolean`);
        await queryRunner.query(`ALTER TABLE "search_preferences" ADD "boleto" boolean`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "search_preferences" DROP COLUMN "boleto"`);
        await queryRunner.query(`ALTER TABLE "search_preferences" DROP COLUMN "tractoAbreviado"`);
        await queryRunner.query(`ALTER TABLE "search_preferences" DROP COLUMN "supCubierta"`);

        await queryRunner.query(`ALTER TABLE "property" DROP COLUMN "boleto"`);
        await queryRunner.query(`ALTER TABLE "property" DROP COLUMN "tractoAbreviado"`);
        await queryRunner.query(`ALTER TABLE "property" DROP COLUMN "direccion"`);
        await queryRunner.query(`ALTER TABLE "property" DROP COLUMN "supCubierta"`);

        await queryRunner.query(`ALTER TABLE "search_preferences" RENAME COLUMN "supTotal" TO "m2"`);
        await queryRunner.query(`ALTER TABLE "property" RENAME COLUMN "supTotal" TO "m2"`);
    }

}
