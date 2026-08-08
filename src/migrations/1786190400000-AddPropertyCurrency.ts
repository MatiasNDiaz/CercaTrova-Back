import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Columna `currency` en `property` — moneda del precio (ARS | USD).
 *
 * ## Por qué
 *
 * `price` era un número sin unidad. El frontend imprimía "USD" como texto fijo
 * en las 9 vistas donde aparece el precio, así que una propiedad publicada en
 * pesos se mostraba —y se compartía por WhatsApp— como si fueran dólares. La
 * moneda pasa a ser un dato de la propiedad, no una suposición de la UI.
 *
 * ## Por qué el default es USD y no hay backfill
 *
 * Todo el catálogo cargado hasta hoy está en dólares (es lo que el frontend
 * venía afirmando y lo que confirmó el relevamiento del catálogo). Con
 * `DEFAULT 'USD'`, el `ALTER TABLE ... ADD` deja las filas existentes ya
 * correctas: no hace falta un UPDATE posterior. Si en algún ambiente hubiera
 * propiedades cargadas en pesos, hay que corregirlas a mano después de correr
 * esto — la migración no puede adivinarlas.
 *
 * ⚠️ Esta migración NO toca datos: solo agrega la columna con su default.
 */
export class AddPropertyCurrency1786190400000 implements MigrationInterface {
    name = 'AddPropertyCurrency1786190400000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // El nombre del tipo sigue la convención que genera TypeORM
        // (`<tabla>_<columna>_enum`), igual que `property_operationtype_enum`
        // en el baseline: si algún día se regenera una migración automática,
        // no aparece un diff espurio por un tipo con otro nombre.
        await queryRunner.query(`CREATE TYPE "public"."property_currency_enum" AS ENUM('ARS', 'USD')`);
        await queryRunner.query(`ALTER TABLE "property" ADD "currency" "public"."property_currency_enum" NOT NULL DEFAULT 'USD'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Orden inverso: la columna primero, el tipo después (Postgres no deja
        // borrar un enum del que todavía depende una columna).
        await queryRunner.query(`ALTER TABLE "property" DROP COLUMN "currency"`);
        await queryRunner.query(`DROP TYPE "public"."property_currency_enum"`);
    }

}
