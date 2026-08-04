import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * SCHEMA BASE — crea la base de datos completa desde cero.
 *
 * ## Por qué existe
 *
 * Hasta acá el schema de desarrollo lo venía creando `synchronize: true`, y las
 * únicas migraciones que había eran INCREMENTALES (la primera arrancaba con
 * `ALTER TABLE "property" RENAME COLUMN "m2"`). Contra una base productiva nueva
 * —donde `NODE_ENV=production` desactiva `synchronize`— `migration:run` fallaba
 * en la primera sentencia: no existía ninguna tabla que alterar. Es decir, no
 * había forma de crear el schema en producción.
 *
 * Como el proyecto todavía NO fue desplegado, el historial de migraciones no
 * aportaba nada: se reemplazó por esta única migración base. Las 4 incrementales
 * previas quedaron archivadas en `_archivo_pre_baseline/` (fuera del glob que
 * lee TypeORM) solo como referencia histórica — ver el README de esa carpeta.
 *
 * ## Verificación (2026-08-03)
 *
 * Se creó una base Postgres vacía, se corrió `migration:run` contra ella y se
 * comparó el resultado con la base de desarrollo que había generado
 * `synchronize`: **192 columnas en ambas, sin una sola diferencia**.
 *
 * ## Requisito previo
 *
 * La extensión `unaccent` la crea `BootstrapService.ensurePostgresExtensions()`
 * en cada arranque de la app; si el usuario de la DB productiva no tiene
 * privilegios para crear extensiones, hay que activarla a mano ANTES de que los
 * filtros de texto del catálogo funcionen (ver CLAUDE.md).
 */
export class InitialSchema1785731109084 implements MigrationInterface {
    name = 'InitialSchema1785731109084'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "favorites" ("user_id" integer NOT NULL, "property_id" integer NOT NULL, "userId" integer, "propertyId" integer, CONSTRAINT "PK_ca292e89ddb91e78ca404a0d268" PRIMARY KEY ("user_id", "property_id"))`);
        await queryRunner.query(`CREATE TABLE "ratings" ("id" SERIAL NOT NULL, "score" integer NOT NULL, "userId" integer NOT NULL, "propertyId" integer NOT NULL, CONSTRAINT "UQ_bc1c64b5824ca1fa2de33f33287" UNIQUE ("userId", "propertyId"), CONSTRAINT "PK_0f31425b073219379545ad68ed9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "comments" ("id" SERIAL NOT NULL, "message" text NOT NULL, "isHidden" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "userId" integer NOT NULL, "propertyId" integer NOT NULL, CONSTRAINT "PK_8bf68bc960f2b69e818bdb90dcb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "property_types" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, CONSTRAINT "UQ_3f23c3f28ed3e1a4b9d7f2ffa20" UNIQUE ("name"), CONSTRAINT "PK_129390b286b9c776438dfa475a8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "property_images" ("id" SERIAL NOT NULL, "url" character varying NOT NULL, "hash" character varying, "isCover" boolean NOT NULL DEFAULT false, "publicId" character varying NOT NULL, "propertyId" integer, CONSTRAINT "UQ_06ef80c6ba3a9f9148aac0597bb" UNIQUE ("hash"), CONSTRAINT "PK_317c3774ee70c26d70c4f80e200" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."property_operationtype_enum" AS ENUM('venta', 'alquiler', 'temporal')`);
        await queryRunner.query(`CREATE TABLE "property" ("id" SERIAL NOT NULL, "title" character varying NOT NULL, "description" character varying NOT NULL, "provincia" character varying NOT NULL, "localidad" character varying NOT NULL, "barrio" character varying NOT NULL, "direccion" character varying, "zone" character varying NOT NULL, "rooms" integer NOT NULL, "bathrooms" integer NOT NULL, "property_deed" boolean NOT NULL DEFAULT false, "tractoAbreviado" boolean NOT NULL DEFAULT false, "boleto" boolean NOT NULL DEFAULT false, "garage" boolean NOT NULL, "patio" boolean NOT NULL, "supTotal" integer, "supCubierta" integer, "antiquity" integer NOT NULL, "price" integer NOT NULL, "status" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "operationType" "public"."property_operationtype_enum" NOT NULL DEFAULT 'venta', "agentId" integer, "referredById" integer, "typeOfPropertyId" integer, CONSTRAINT "PK_d80743e6191258a5003d5843b4f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."search_preferences_operationtype_enum" AS ENUM('venta', 'alquiler', 'temporal')`);
        await queryRunner.query(`CREATE TABLE "search_preferences" ("id" SERIAL NOT NULL, "zone" character varying, "localidad" character varying, "barrio" character varying, "operationType" "public"."search_preferences_operationtype_enum", "property_deed" boolean, "tractoAbreviado" boolean, "boleto" boolean, "preferredPrice" integer, "minRooms" integer, "minBathrooms" integer, "supTotal" integer, "supCubierta" integer, "garage" boolean, "patio" boolean, "maxAntiquity" integer, "notifyNewMatches" boolean NOT NULL DEFAULT true, "notifyPriceDrops" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" integer, "typeOfPropertyId" integer, CONSTRAINT "PK_a8c97c856d942840111c14aac6a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "notifications" ("id" SERIAL NOT NULL, "title" character varying NOT NULL, "message" character varying NOT NULL, "propertyId" integer, "read" boolean NOT NULL DEFAULT false, "targetRole" character varying NOT NULL DEFAULT 'user', "relatedUserId" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" integer, CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('user', 'admin')`);
        await queryRunner.query(`CREATE TYPE "public"."users_authprovider_enum" AS ENUM('local', 'google')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "surname" character varying, "phone" character varying, "photo" character varying, "email" character varying NOT NULL, "password" character varying, "profileIncomplete" boolean NOT NULL DEFAULT false, "role" "public"."users_role_enum" NOT NULL DEFAULT 'user', "authProvider" "public"."users_authprovider_enum" NOT NULL DEFAULT 'local', "notifyBroadcast" boolean NOT NULL DEFAULT true, "tokenVersion" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."user_search_feedback_propertytype_enum" AS ENUM('casa', 'departamento', 'terreno', 'local', 'oficina')`);
        await queryRunner.query(`CREATE TYPE "public"."user_search_feedback_operationtype_enum" AS ENUM('alquiler', 'venta')`);
        await queryRunner.query(`CREATE TABLE "user_search_feedback" ("id" SERIAL NOT NULL, "rooms" integer, "bathrooms" integer, "zone" character varying, "localidad" character varying, "barrio" character varying, "priceMin" numeric(12,2), "priceMax" numeric(12,2), "propertyType" "public"."user_search_feedback_propertytype_enum", "operationType" "public"."user_search_feedback_operationtype_enum", "antiquityMax" integer, "hasGarage" boolean, "hasPatio" boolean, "notes" text, "deviceId" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_098976e519f7ce079685d461097" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."property_requests_status_enum" AS ENUM('enviado', 'en_revision', 'aceptado', 'rechazado')`);
        await queryRunner.query(`CREATE TABLE "property_requests" ("id" SERIAL NOT NULL, "localidad" character varying NOT NULL, "barrio" character varying NOT NULL, "direccion" character varying NOT NULL, "pisoDepto" character varying, "tipoPropiedad" character varying NOT NULL, "tipoOperacion" character varying NOT NULL, "estadoConservacion" character varying NOT NULL, "m2Totales" double precision NOT NULL, "m2Cubiertos" double precision NOT NULL, "habitaciones" integer NOT NULL, "baños" integer NOT NULL, "patio" boolean NOT NULL DEFAULT false, "garage" boolean NOT NULL DEFAULT false, "antiguedad" integer NOT NULL, "orientacion" character varying, "escritura" boolean NOT NULL DEFAULT false, "impuestosAlDia" boolean NOT NULL DEFAULT false, "aptoCredito" boolean NOT NULL DEFAULT false, "precioEstimado" numeric(12,2) NOT NULL, "mensajeAgente" text, "status" "public"."property_requests_status_enum" NOT NULL DEFAULT 'en_revision', "userId" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b4a6019d5e45af82305ccfcb44c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "failed_emails" ("id" SERIAL NOT NULL, "to" character varying NOT NULL, "subject" character varying NOT NULL, "error" text, "attempts" integer NOT NULL DEFAULT '1', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b34951ffbacc0a87df7dc5f0aae" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "post_likes" ("user_id" integer NOT NULL, "post_id" integer NOT NULL, CONSTRAINT "PK_8f64693922a9e8c4e2605850d0b" PRIMARY KEY ("user_id", "post_id"))`);
        await queryRunner.query(`CREATE TABLE "post_comments" ("id" SERIAL NOT NULL, "content" text NOT NULL, "isHidden" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "postId" integer NOT NULL, "userId" integer NOT NULL, "parentCommentId" integer, CONSTRAINT "PK_2e99e04b4a1b31de6f833c18ced" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "posts" ("id" SERIAL NOT NULL, "description" text NOT NULL, "imageUrl" character varying NOT NULL, "imagePublicId" character varying NOT NULL, "likesCount" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "agentId" integer, CONSTRAINT "PK_2829ac61eff60fcec60d7274b9e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "page_visits" ("id" SERIAL NOT NULL, "visitorId" character varying NOT NULL, "path" character varying NOT NULL, "userId" integer, "isAdmin" boolean NOT NULL DEFAULT false, "durationMs" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d09b1498521da41bd2cd21b11b8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d01be9cd187e95fb7fca080154" ON "page_visits" ("visitorId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_95d4a665aecbbafc2df537eb05" ON "page_visits" ("createdAt") `);
        await queryRunner.query(`CREATE TABLE "property_views" ("id" SERIAL NOT NULL, "propertyId" integer NOT NULL, "visitorId" character varying NOT NULL, "userId" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_af59c050eb84bbf1700199d5f1a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d898588b38d5212c98e4a33c4b" ON "property_views" ("propertyId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_0e389e34d33ca319c200d3a955" ON "property_views" ("createdAt") `);
        await queryRunner.query(`CREATE TYPE "public"."filter_usages_operationtype_enum" AS ENUM('venta', 'alquiler', 'temporal')`);
        await queryRunner.query(`CREATE TABLE "filter_usages" ("id" SERIAL NOT NULL, "visitorId" character varying NOT NULL, "userId" integer, "provincia" character varying, "localidad" character varying, "barrio" character varying, "zone" character varying, "typeOfPropertyId" integer, "operationType" "public"."filter_usages_operationtype_enum", "rooms" integer, "bathrooms" integer, "minPrice" integer, "maxPrice" integer, "minSupTotal" integer, "maxSupTotal" integer, "minSupCubierta" integer, "maxSupCubierta" integer, "maxAntiquity" integer, "garage" boolean, "patio" boolean, "property_deed" boolean, "tractoAbreviado" boolean, "boleto" boolean, "search" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_797df45eb09e4e28b90145c070c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b0343bfbc6999fafcca6add45c" ON "filter_usages" ("createdAt") `);
        await queryRunner.query(`ALTER TABLE "favorites" ADD CONSTRAINT "FK_e747534006c6e3c2f09939da60f" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "favorites" ADD CONSTRAINT "FK_39fd1b53d2b44d5bc1d766f9a2a" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ratings" ADD CONSTRAINT "FK_4d0b0e3a4c4af854d225154ba40" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ratings" ADD CONSTRAINT "FK_3b66fdbcc757c188252a265e4ce" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "comments" ADD CONSTRAINT "FK_7e8d7c49f218ebb14314fdb3749" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "comments" ADD CONSTRAINT "FK_f4ec40620b24b0b818364cd74dd" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "property_images" ADD CONSTRAINT "FK_7a07b6b7f9418bf1d5160106694" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "property" ADD CONSTRAINT "FK_3df22387cc25ecbbe851a57fd32" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "property" ADD CONSTRAINT "FK_55a8e47361a8043e99fc778610d" FOREIGN KEY ("referredById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "property" ADD CONSTRAINT "FK_b6df67710ea29dad745c74c9eff" FOREIGN KEY ("typeOfPropertyId") REFERENCES "property_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "search_preferences" ADD CONSTRAINT "FK_b16dbb77851fe21bd7461e04e29" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "search_preferences" ADD CONSTRAINT "FK_7e89cbddbb7d37414745696adec" FOREIGN KEY ("typeOfPropertyId") REFERENCES "property_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "FK_692a909ee0fa9383e7859f9b406" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "property_requests" ADD CONSTRAINT "FK_af915913dad04f76991ae316050" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "post_likes" ADD CONSTRAINT "FK_9b9a7fc5eeff133cf71b8e06a7b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "post_likes" ADD CONSTRAINT "FK_b40d37469c501092203d285af80" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "post_comments" ADD CONSTRAINT "FK_ac65d744abc05279aee0b290857" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "post_comments" ADD CONSTRAINT "FK_62817b3571ec31e552a3cae4e1c" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "post_comments" ADD CONSTRAINT "FK_2f4fd3e12513addbc37a4e6d56e" FOREIGN KEY ("parentCommentId") REFERENCES "post_comments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "posts" ADD CONSTRAINT "FK_f3581085de2f6ac325d11fe0a9c" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "page_visits" ADD CONSTRAINT "FK_89e3e96e4619a5d4d9e04750cdb" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "property_views" ADD CONSTRAINT "FK_a742773b506c4afd27382cf7adb" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "property_views" DROP CONSTRAINT "FK_a742773b506c4afd27382cf7adb"`);
        await queryRunner.query(`ALTER TABLE "page_visits" DROP CONSTRAINT "FK_89e3e96e4619a5d4d9e04750cdb"`);
        await queryRunner.query(`ALTER TABLE "posts" DROP CONSTRAINT "FK_f3581085de2f6ac325d11fe0a9c"`);
        await queryRunner.query(`ALTER TABLE "post_comments" DROP CONSTRAINT "FK_2f4fd3e12513addbc37a4e6d56e"`);
        await queryRunner.query(`ALTER TABLE "post_comments" DROP CONSTRAINT "FK_62817b3571ec31e552a3cae4e1c"`);
        await queryRunner.query(`ALTER TABLE "post_comments" DROP CONSTRAINT "FK_ac65d744abc05279aee0b290857"`);
        await queryRunner.query(`ALTER TABLE "post_likes" DROP CONSTRAINT "FK_b40d37469c501092203d285af80"`);
        await queryRunner.query(`ALTER TABLE "post_likes" DROP CONSTRAINT "FK_9b9a7fc5eeff133cf71b8e06a7b"`);
        await queryRunner.query(`ALTER TABLE "property_requests" DROP CONSTRAINT "FK_af915913dad04f76991ae316050"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_692a909ee0fa9383e7859f9b406"`);
        await queryRunner.query(`ALTER TABLE "search_preferences" DROP CONSTRAINT "FK_7e89cbddbb7d37414745696adec"`);
        await queryRunner.query(`ALTER TABLE "search_preferences" DROP CONSTRAINT "FK_b16dbb77851fe21bd7461e04e29"`);
        await queryRunner.query(`ALTER TABLE "property" DROP CONSTRAINT "FK_b6df67710ea29dad745c74c9eff"`);
        await queryRunner.query(`ALTER TABLE "property" DROP CONSTRAINT "FK_55a8e47361a8043e99fc778610d"`);
        await queryRunner.query(`ALTER TABLE "property" DROP CONSTRAINT "FK_3df22387cc25ecbbe851a57fd32"`);
        await queryRunner.query(`ALTER TABLE "property_images" DROP CONSTRAINT "FK_7a07b6b7f9418bf1d5160106694"`);
        await queryRunner.query(`ALTER TABLE "comments" DROP CONSTRAINT "FK_f4ec40620b24b0b818364cd74dd"`);
        await queryRunner.query(`ALTER TABLE "comments" DROP CONSTRAINT "FK_7e8d7c49f218ebb14314fdb3749"`);
        await queryRunner.query(`ALTER TABLE "ratings" DROP CONSTRAINT "FK_3b66fdbcc757c188252a265e4ce"`);
        await queryRunner.query(`ALTER TABLE "ratings" DROP CONSTRAINT "FK_4d0b0e3a4c4af854d225154ba40"`);
        await queryRunner.query(`ALTER TABLE "favorites" DROP CONSTRAINT "FK_39fd1b53d2b44d5bc1d766f9a2a"`);
        await queryRunner.query(`ALTER TABLE "favorites" DROP CONSTRAINT "FK_e747534006c6e3c2f09939da60f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b0343bfbc6999fafcca6add45c"`);
        await queryRunner.query(`DROP TABLE "filter_usages"`);
        await queryRunner.query(`DROP TYPE "public"."filter_usages_operationtype_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0e389e34d33ca319c200d3a955"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d898588b38d5212c98e4a33c4b"`);
        await queryRunner.query(`DROP TABLE "property_views"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_95d4a665aecbbafc2df537eb05"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d01be9cd187e95fb7fca080154"`);
        await queryRunner.query(`DROP TABLE "page_visits"`);
        await queryRunner.query(`DROP TABLE "posts"`);
        await queryRunner.query(`DROP TABLE "post_comments"`);
        await queryRunner.query(`DROP TABLE "post_likes"`);
        await queryRunner.query(`DROP TABLE "failed_emails"`);
        await queryRunner.query(`DROP TABLE "property_requests"`);
        await queryRunner.query(`DROP TYPE "public"."property_requests_status_enum"`);
        await queryRunner.query(`DROP TABLE "user_search_feedback"`);
        await queryRunner.query(`DROP TYPE "public"."user_search_feedback_operationtype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."user_search_feedback_propertytype_enum"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_authprovider_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
        await queryRunner.query(`DROP TABLE "search_preferences"`);
        await queryRunner.query(`DROP TYPE "public"."search_preferences_operationtype_enum"`);
        await queryRunner.query(`DROP TABLE "property"`);
        await queryRunner.query(`DROP TYPE "public"."property_operationtype_enum"`);
        await queryRunner.query(`DROP TABLE "property_images"`);
        await queryRunner.query(`DROP TABLE "property_types"`);
        await queryRunner.query(`DROP TABLE "comments"`);
        await queryRunner.query(`DROP TABLE "ratings"`);
        await queryRunner.query(`DROP TABLE "favorites"`);
    }

}
