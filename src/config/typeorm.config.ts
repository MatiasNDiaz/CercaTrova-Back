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
    entities: [User, Property, PropertyRequest, UserSearchFeedback, Rating, Comment, SearchPreference, Notification, Favorite, PropertyType, PropertyImages, Stat],
   // ⚠️ Solo en desarrollo, ¡cambia a false en Producción!
    synchronize: true, 
// dropSchema: true, // Descomenta esta línea si quieres que se borren las tablas y se vuelvan a crear (útil en desarrollo)
};