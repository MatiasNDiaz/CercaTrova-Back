// src/config/typeorm.config.ts

import { TypeOrmModuleOptions } from '@nestjs/typeorm';
// ⚠️ IMPORTANTE: Usamos 'dotenv' para cargar el .env
// porque TypeORM se inicializa antes que el ConfigModule de NestJS
import * as dotenv from 'dotenv';
dotenv.config(); 

import { User } from '../modules/users/entities/user.entity';
import { Property } from '../modules/properties/entities/property.entity';
import { Request } from '../modules/requests/entities/request.entity';
import { Rating } from 'src/modules/ratings/entities/rating.entity';
import { Comment } from 'src/modules/comments/entities/comment.entity';
import { Favorite } from 'src/modules/favorites/entities/favorite.entity';
import { SearchPreference } from 'src/modules/search-preferences/entities/search-preference.entity';
import { Notification } from 'src/modules/notifications/entities/notification.entity';
// Importa más entidades según necesites

export const typeOrmConfig: TypeOrmModuleOptions = {
    type: 'postgres',
    // Utilizamos process.env para leer las variables del .env
    host: process.env.DB_HOST || 'localhost', 
    port: parseInt(process.env.DB_PORT || '5432'), // Convertimos a número
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    
    entities: [User, Property, Request, Rating, Comment, SearchPreference, Notification, Favorite],
    
   // ⚠️ Solo en desarrollo, ¡cambia a false en Producción!
    synchronize: true, 
};