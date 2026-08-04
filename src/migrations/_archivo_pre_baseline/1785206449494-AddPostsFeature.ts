import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPostsFeature1785206449494 implements MigrationInterface {
    name = 'AddPostsFeature1785206449494'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "post_likes" ("user_id" integer NOT NULL, "post_id" integer NOT NULL, CONSTRAINT "PK_8f64693922a9e8c4e2605850d0b" PRIMARY KEY ("user_id", "post_id"))`);
        await queryRunner.query(`CREATE TABLE "post_comments" ("id" SERIAL NOT NULL, "content" text NOT NULL, "isHidden" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "postId" integer NOT NULL, "userId" integer NOT NULL, "parentCommentId" integer, CONSTRAINT "PK_2e99e04b4a1b31de6f833c18ced" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "posts" ("id" SERIAL NOT NULL, "description" text NOT NULL, "imageUrl" character varying NOT NULL, "imagePublicId" character varying NOT NULL, "likesCount" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "agentId" integer, CONSTRAINT "PK_2829ac61eff60fcec60d7274b9e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "post_likes" ADD CONSTRAINT "FK_9b9a7fc5eeff133cf71b8e06a7b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "post_likes" ADD CONSTRAINT "FK_b40d37469c501092203d285af80" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "post_comments" ADD CONSTRAINT "FK_ac65d744abc05279aee0b290857" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "post_comments" ADD CONSTRAINT "FK_62817b3571ec31e552a3cae4e1c" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "post_comments" ADD CONSTRAINT "FK_2f4fd3e12513addbc37a4e6d56e" FOREIGN KEY ("parentCommentId") REFERENCES "post_comments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "posts" ADD CONSTRAINT "FK_f3581085de2f6ac325d11fe0a9c" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "posts" DROP CONSTRAINT "FK_f3581085de2f6ac325d11fe0a9c"`);
        await queryRunner.query(`ALTER TABLE "post_comments" DROP CONSTRAINT "FK_2f4fd3e12513addbc37a4e6d56e"`);
        await queryRunner.query(`ALTER TABLE "post_comments" DROP CONSTRAINT "FK_62817b3571ec31e552a3cae4e1c"`);
        await queryRunner.query(`ALTER TABLE "post_comments" DROP CONSTRAINT "FK_ac65d744abc05279aee0b290857"`);
        await queryRunner.query(`ALTER TABLE "post_likes" DROP CONSTRAINT "FK_b40d37469c501092203d285af80"`);
        await queryRunner.query(`ALTER TABLE "post_likes" DROP CONSTRAINT "FK_9b9a7fc5eeff133cf71b8e06a7b"`);
        await queryRunner.query(`DROP TABLE "posts"`);
        await queryRunner.query(`DROP TABLE "post_comments"`);
        await queryRunner.query(`DROP TABLE "post_likes"`);
    }

}
