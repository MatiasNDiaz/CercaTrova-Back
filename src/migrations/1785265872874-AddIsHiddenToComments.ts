import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsHiddenToComments1785265872874 implements MigrationInterface {
    name = 'AddIsHiddenToComments1785265872874'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comments" ADD "isHidden" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comments" DROP COLUMN "isHidden"`);
    }

}
