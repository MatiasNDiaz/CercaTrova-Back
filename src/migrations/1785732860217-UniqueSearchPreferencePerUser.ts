import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Una sola preferencia de búsqueda por usuario.
 *
 * ## Por qué
 *
 * `POST /search-preferences` insertaba una fila nueva en cada llamada. Como
 * `getByUser()` usa `findOne`, el usuario solo veía la primera y no se enteraba
 * de las duplicadas — pero `findAllWithUsers()`, que es lo que recorre
 * `handleNewProperty()` para el matching, las recorría TODAS. Un usuario que
 * tocaba "Guardar" tres veces recibía 3 notificaciones y 3 emails idénticos por
 * cada propiedad nueva que matcheara, sin forma de deshacerlo desde la UI.
 *
 * El service ya hace upsert; esta constraint es la garantía real (cierra
 * también la ventana de dos requests simultáneas).
 *
 * ## ⚠️ Migración de DATOS
 *
 * El `CREATE UNIQUE INDEX` **falla** si la tabla ya tiene duplicados, así que
 * primero se limpian. Criterio: se conserva la fila con `updatedAt` más
 * reciente (la última que el usuario editó, que es la que venía viendo por el
 * `findOne`); en empate, la de `id` más alto. Las demás se borran.
 *
 * En la base de desarrollo al momento de escribir esto no había duplicados
 * (2 filas, 2 usuarios distintos): el DELETE no borró nada ahí. Se deja igual
 * (idempotente) para cualquier otro ambiente donde sí los haya — en particular
 * producción, donde nadie va a estar mirando la consola en el momento exacto
 * del deploy.
 *
 * ## 🔍 Auditoría ANTES de borrar (agregado 2026-08-04)
 *
 * Antes del DELETE, la migración:
 *  1. Loguea por consola cuántas filas y de qué usuarios se van a borrar (o
 *     confirma que no hay ninguna).
 *  2. Copia esas filas — completas, no solo un resumen — a la tabla
 *     `_migration_backup_search_preferences_dupes`, que la migración NO borra
 *     nunca (ni en `up` ni en `down`). Sirve para poder auditar en producción
 *     qué se borró, aun si nadie capturó la salida del deploy en el momento, y
 *     para recuperar a mano algún valor si hiciera falta.
 */
export class UniqueSearchPreferencePerUser1785732860217 implements MigrationInterface {
    name = 'UniqueSearchPreferencePerUser1785732860217'

    /** Mismo criterio en las tres queries: se conserva la fila con `updatedAt` más reciente por usuario (empate → id más alto); el resto son "duplicadas". */
    private static readonly DUPLICADAS_WHERE = `
        sp."id" NOT IN (
            SELECT DISTINCT ON ("userId") "id"
            FROM "search_preferences"
            WHERE "userId" IS NOT NULL
            ORDER BY "userId", "updatedAt" DESC, "id" DESC
        )
        AND sp."userId" IS NOT NULL
    `;

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── 1. AUDITORÍA: qué se va a borrar, ANTES de borrarlo ──
        const aBorrar: Array<{ id: number; userId: number }> = await queryRunner.query(`
            SELECT sp."id", sp."userId"
            FROM "search_preferences" sp
            WHERE ${UniqueSearchPreferencePerUser1785732860217.DUPLICADAS_WHERE}
        `);

        if (aBorrar.length === 0) {
            console.log(
                '[UniqueSearchPreferencePerUser] Sin duplicados — no hay filas para borrar.',
            );
        } else {
            const porUsuario = new Map<number, number>();
            aBorrar.forEach((r) => porUsuario.set(r.userId, (porUsuario.get(r.userId) ?? 0) + 1));

            console.log(
                `[UniqueSearchPreferencePerUser] ⚠️  Se van a borrar ${aBorrar.length} fila(s) ` +
                `duplicada(s) de ${porUsuario.size} usuario(s) distinto(s) antes de crear el índice único.`,
            );
            porUsuario.forEach((n, userId) => {
                console.log(
                  `[UniqueSearchPreferencePerUser]    userId=${userId} → se borran ${n} fila(s) ` +
                  '(se conserva la de updatedAt más reciente)',
                );
              });

            // Respaldo PERSISTENTE de las filas completas (no solo el log, que
            // puede perderse si nadie revisa la salida del deploy).
            await queryRunner.query(`
                CREATE TABLE IF NOT EXISTS "_migration_backup_search_preferences_dupes"
                (LIKE "search_preferences" INCLUDING ALL)
            `);
            await queryRunner.query(`
                INSERT INTO "_migration_backup_search_preferences_dupes"
                SELECT sp.* FROM "search_preferences" sp
                WHERE ${UniqueSearchPreferencePerUser1785732860217.DUPLICADAS_WHERE}
            `);
        }

        // ── 2. Deduplicar ANTES de crear el índice único, si no el CREATE falla ──
        await queryRunner.query(`
            DELETE FROM "search_preferences" sp
            WHERE ${UniqueSearchPreferencePerUser1785732860217.DUPLICADAS_WHERE}
        `);

        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b16dbb77851fe21bd7461e04e2" ON "search_preferences" ("userId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Las filas duplicadas borradas NO se restauran automáticamente: están
        // en "_migration_backup_search_preferences_dupes" (si esa tabla existe,
        // o sea si hubo algo que borrar) para recuperarlas a mano si hace falta.
        // El down solo quita la constraint.
        await queryRunner.query(`DROP INDEX "public"."IDX_b16dbb77851fe21bd7461e04e2"`);
    }

}
