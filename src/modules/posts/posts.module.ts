import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { PostsCleanupService } from './posts-cleanup.service';
import { Post } from './entities/post.entity';
import { PostLike } from './entities/post-like.entity';
import { PostComment } from './entities/post-comment.entity';
import { CloudinaryModule } from 'src/common/Cloudinary/cloudinary.module';
import { NotificationModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, PostLike, PostComment]),
    CloudinaryModule,
    // Para avisar de publicaciones nuevas y de respuestas a comentarios.
    // No hay ciclo: NotificationModule no importa PostsModule.
    NotificationModule,
  ],
  controllers: [PostsController],
  providers: [PostsService, PostsCleanupService],
  exports: [PostsService],
})
export class PostsModule {}
