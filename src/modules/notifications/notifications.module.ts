import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationService } from './notifications.service';
import { NotificationController } from './notifications.controller'; 
import { UsersModule } from '../users/users.module';
import { SearchPreferencesModule } from '../search-preferences/search-preferences.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    UsersModule,
    SearchPreferencesModule,
    EmailModule, // ← NECESARIO
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
