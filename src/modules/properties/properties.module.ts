import { Module } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { PropertiesController } from './properties.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Property } from './entities/property.entity';
import { PropertyType } from '../typeOfProperty/entities/typeOfProperty.entity';
import { ImagesPropertyModule } from '../ImagesProperty/images-property.module';
import { CloudinaryModule } from 'src/common/Cloudinary/cloudinary.module';
import { NotificationModule } from '../notifications/notifications.module';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Property, PropertyType]),
    ImagesPropertyModule,
    CloudinaryModule,
    NotificationModule,
    // Telemetría de vistas de propiedad y de uso de filtros (Fase 0).
    TrackingModule,
  ],
  controllers: [PropertiesController],
  providers: [PropertiesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
