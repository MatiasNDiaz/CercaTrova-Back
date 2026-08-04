import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTrackingInfrastructure1785269135372 implements MigrationInterface {
    name = 'AddTrackingInfrastructure1785269135372'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "page_visits" ("id" SERIAL NOT NULL, "visitorId" character varying NOT NULL, "path" character varying NOT NULL, "userId" integer, "isAdmin" boolean NOT NULL DEFAULT false, "durationMs" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d09b1498521da41bd2cd21b11b8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d01be9cd187e95fb7fca080154" ON "page_visits" ("visitorId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_95d4a665aecbbafc2df537eb05" ON "page_visits" ("createdAt") `);
        await queryRunner.query(`CREATE TABLE "property_views" ("id" SERIAL NOT NULL, "propertyId" integer NOT NULL, "visitorId" character varying NOT NULL, "userId" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_af59c050eb84bbf1700199d5f1a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d898588b38d5212c98e4a33c4b" ON "property_views" ("propertyId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_0e389e34d33ca319c200d3a955" ON "property_views" ("createdAt") `);
        await queryRunner.query(`CREATE TYPE "public"."filter_usages_operationtype_enum" AS ENUM('venta', 'alquiler', 'temporal')`);
        await queryRunner.query(`CREATE TABLE "filter_usages" ("id" SERIAL NOT NULL, "visitorId" character varying NOT NULL, "userId" integer, "provincia" character varying, "localidad" character varying, "barrio" character varying, "zone" character varying, "typeOfPropertyId" integer, "operationType" "public"."filter_usages_operationtype_enum", "rooms" integer, "bathrooms" integer, "minPrice" integer, "maxPrice" integer, "minSupTotal" integer, "maxSupTotal" integer, "minSupCubierta" integer, "maxSupCubierta" integer, "maxAntiquity" integer, "garage" boolean, "patio" boolean, "property_deed" boolean, "tractoAbreviado" boolean, "boleto" boolean, "search" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_797df45eb09e4e28b90145c070c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b0343bfbc6999fafcca6add45c" ON "filter_usages" ("createdAt") `);
        await queryRunner.query(`CREATE TYPE "public"."users_authprovider_enum" AS ENUM('local', 'google')`);
        await queryRunner.query(`ALTER TABLE "users" ADD "authProvider" "public"."users_authprovider_enum" NOT NULL DEFAULT 'local'`);
        await queryRunner.query(`ALTER TABLE "page_visits" ADD CONSTRAINT "FK_89e3e96e4619a5d4d9e04750cdb" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "property_views" ADD CONSTRAINT "FK_a742773b506c4afd27382cf7adb" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "property_views" DROP CONSTRAINT "FK_a742773b506c4afd27382cf7adb"`);
        await queryRunner.query(`ALTER TABLE "page_visits" DROP CONSTRAINT "FK_89e3e96e4619a5d4d9e04750cdb"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "authProvider"`);
        await queryRunner.query(`DROP TYPE "public"."users_authprovider_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b0343bfbc6999fafcca6add45c"`);
        await queryRunner.query(`DROP TABLE "filter_usages"`);
        await queryRunner.query(`DROP TYPE "public"."filter_usages_operationtype_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0e389e34d33ca319c200d3a955"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d898588b38d5212c98e4a33c4b"`);
        await queryRunner.query(`DROP TABLE "property_views"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_95d4a665aecbbafc2df537eb05"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d01be9cd187e95fb7fca080154"`);
        await queryRunner.query(`DROP TABLE "page_visits"`);
    }

}
