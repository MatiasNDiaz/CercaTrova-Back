import { Module } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { PropertiesController } from './properties.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Property } from './entities/property.entity';
import { PropertyType } from '../typeOfProperty/entities/typeOfProperty.entity';
import { ImagesPropertyModule } from '../ImagesProperty/images-property.module';
import { CloudinaryModule } from 'src/common/Cloudinary/cloudinary.module';
import { NotificationModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Property, PropertyType]),
    ImagesPropertyModule,
    CloudinaryModule,
     NotificationModule 
  ],
  controllers: [PropertiesController],
  providers: [PropertiesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
