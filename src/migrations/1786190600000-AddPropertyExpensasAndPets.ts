import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Dos columnas nuevas en `property`: `expensas` y `aptoMascotas`.
 *
 * ## `expensas` — integer NULLABLE
 *
 * Nullable porque no toda propiedad tiene expensas (una casa no paga), y "sin
 * expensas informadas" es un estado distinto de `0` ("no tiene expensas"). Esa
 * diferencia importa: el frontend NO muestra la tarjeta de expensas cuando es
 * `null`, en vez de dibujar un "Expensas: —" que ensucia la ficha.
 *
 * ⚠️ **Siempre en pesos**, sin importar `Property.currency`. Es como funciona
 * el mercado local: el inmueble se publica en dólares y las expensas se cobran
 * en pesos. Por eso NO tiene columna de moneda propia — ver el docstring de la
 * entidad.
 *
 * `integer` y no `numeric`: son montos mensuales redondeados, y un `numeric` de
 * TypeORM vuelve como **string** en las respuestas JSON, lo que obligaría a
 * parsear en el frontend y a documentar la rareza en el contrato.
 *
 * ## `aptoMascotas` — boolean NOT NULL DEFAULT false
 *
 * Lleva default explícito, a diferencia de `garage`/`patio` (que son NOT NULL
 * sin default por herencia del esquema original): sin él, este `ALTER TABLE`
 * fallaría sobre las filas ya existentes. `false` es el valor honesto para el
 * catálogo previo — nadie declaró que esas propiedades acepten mascotas.
 *
 * ⚠️ Esta migración NO toca datos: las dos columnas quedan en su valor por
 * defecto (`NULL` y `false`) y no hay nada que backfillear, porque no existe
 * ningún dato previo del que se pueda inferir ninguno de los dos.
 */
export class AddPropertyExpensasAndPets1786190600000 implements MigrationInterface {
    name = 'AddPropertyExpensasAndPets1786190600000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "property" ADD "expensas" integer`);
        await queryRunner.query(`ALTER TABLE "property" ADD "aptoMascotas" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "property" DROP COLUMN "aptoMascotas"`);
        await queryRunner.query(`ALTER TABLE "property" DROP COLUMN "expensas"`);
    }

}
