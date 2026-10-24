import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Notificaciones con destino puntual: `commentId` y `ratingId`.
 *
 * Con ellas el panel lleva al detalle de la propiedad directo al comentario o
 * a la valoración que originó el aviso (`#comentario-ID`) y lo resalta.
 *
 * ## ⚠️ Compatibilidad — nada se borra
 *
 * Dos columnas nuevas NULLABLE, sin default ni FK: es un ALTER instantáneo y
 * las notificaciones existentes quedan intactas (con null, llevan a la sección
 * completa: `#comentarios` / `#valoraciones`). Sin FK a propósito: si después
 * se borra el comentario, la notificación no debe desaparecer ni fallar; el
 * detalle cae a la sección.
 */
export class NotificationTargets1786190900000 implements MigrationInterface {
  name = 'NotificationTargets1786190900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "commentId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "ratingId" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "ratingId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "commentId"`,
    );
  }
}
