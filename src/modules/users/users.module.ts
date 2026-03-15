import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { BootstrapService } from 'src/common/bootstraps/bootstrap.service';
import { CloudinaryModule } from 'src/common/Cloudinary/cloudinary.module';
import { Favorite } from 'src/modules/favorites/entities/favorite.entity';
import { Rating } from 'src/modules/ratings/entities/rating.entity';
import { Comment } from 'src/modules/comments/entities/comment.entity';
import { SearchPreference } from 'src/modules/search-preferences/entities/search-preference.entity';
import { Notification } from 'src/modules/notifications/entities/notification.entity';
import { PropertyRequest } from '../PropertyRequest/entities/PropertyRequest';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Favorite,
      Rating,
      Comment,
      SearchPreference,
      Notification,
       PropertyRequest
    ]),
    CloudinaryModule,
  ],
  providers: [UsersService, BootstrapService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}