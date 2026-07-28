import { TypeOrmModuleOptions } from '@nestjs/typeorm';
// ⚠️ IMPORTANTE: Usamos 'dotenv' para cargar el .env
// porque TypeORM se inicializa antes que el ConfigModule de NestJS
import * as dotenv from 'dotenv';
import { User } from '../modules/users/entities/user.entity';
import { Property } from '../modules/properties/entities/property.entity';
import { UserSearchFeedback } from '../modules/requests/entities/request.entity';
import { Rating } from '../modules/ratings/entities/rating.entity';
import { Comment } from '../modules/comments/entities/comment.entity';
import { Favorite } from '../modules/favorites/entities/favorite.entity';
import { SearchPreference } from '../modules/search-preferences/entities/search-preference.entity';
import { Notification } from '../modules/notifications/entities/notification.entity';
import { PropertyType } from '../modules/typeOfProperty/entities/typeOfProperty.entity';
import { PropertyImages } from '../modules/ImagesProperty/entities/ImagesPropertyEntity';
import { Stat } from '../modules/stats/entities/stat.entity';
import { PropertyRequest } from '../modules/PropertyRequest/entities/PropertyRequest';
import { FailedEmail } from '../modules/notifications/email/entities/failed-email.entity';
// Importa más entidades según necesites

dotenv.config(); 
export const typeOrmConfig: TypeOrmModuleOptions = {
    type: 'postgres',
    // Utilizamos process.env para leer las variables del .env
    host: process.env.DB_HOST || 'localhost', 
    port: parseInt(process.env.DB_PORT || '5432'), // Convertimos a número
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [User, Property, PropertyRequest, UserSearchFeedback, Rating, Comment, SearchPreference, Notification, Favorite, PropertyType, PropertyImages, Stat, FailedEmail],
    // Migraciones (se corren con `npm run migration:run`, nunca automáticamente).
    // El glob cubre tanto el código fuente (.ts en dev) como el build (.js en prod).
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    // 🔒 SEGURIDAD (M10): synchronize NUNCA en producción — puede dropear
    // columnas con datos reales al renombrar entidades. Antes de deployar
    // a producción hay que generar migrations de TypeORM (ver
    // SECURITY_FIXES_2.md) y correr con NODE_ENV=production.
    synchronize: process.env.NODE_ENV !== 'production',
// dropSchema: true, // Descomenta esta línea si quieres que se borren las tablas y se vuelvan a crear (útil en desarrollo)
};