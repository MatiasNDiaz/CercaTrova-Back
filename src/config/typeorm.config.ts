import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../modules/users/entities/user.entity';
import { Property } from '../modules/properties/entities/property.entity';
import { Request } from '../modules/requests/entities/request.entity';
import { Rating } from 'src/modules/ratings/entities/rating.entity';
import { Comment } from 'src/modules/comments/entities/comment.entity';
import { Favorite } from 'src/modules/favorites/entities/favorite.entity';
import { SearchPreference } from 'src/modules/search-preferences/entities/search-preference.entity';
import { Notification } from 'src/modules/notifications/entities/notification.entity';
// importá más entidades según necesites

export const typeOrmConfig: TypeOrmModuleOptions = {
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: 'perrito',
    database: 'inmobiliaria',
    entities: [User, Property, Request, Rating, Comment, SearchPreference, Notification, Favorite],
    synchronize: true, // ⚠️ Solo en desarrollo
};
