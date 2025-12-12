import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { User } from '../users/entities/user.entity';
import { Property } from '../properties/entities/property.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from './entities/comment.entity';

@Module({
   imports: [TypeOrmModule.forFeature([Comment, Property, User])],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
