import { DataSource } from 'typeorm';
import { typeOrmConfig } from './typeorm.config';

/**
 * DataSource que usa la CLI de TypeORM (`npm run migration:generate|run|revert`).
 *
 * Reutiliza exactamente la misma configuración que levanta Nest (`typeOrmConfig`)
 * para que no haya dos verdades sobre entidades/credenciales, pero fuerza
 * `synchronize: false`: la CLI nunca debe auto-sincronizar el schema, para eso
 * están las migraciones.
 */
export default new DataSource({
  ...(typeOrmConfig as any),
  synchronize: false,
  migrations: ['src/migrations/*.ts'],
});
