import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../modules/users/entities/user.entity';
import { Property } from '../modules/properties/entities/property.entity';
import { Request } from '../modules/requests/entities/request.entity';
// importá más entidades según necesites

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'perrito',
  database: 'inmobiliaria',
  entities: [User, Property, Request /* + demás entidades */],
  synchronize: true, // ⚠️ Solo en desarrollo
};
