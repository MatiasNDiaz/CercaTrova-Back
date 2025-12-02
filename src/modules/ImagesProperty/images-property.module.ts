import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertyImages } from './entities/ImagesPropertyEntity';
import { CloudinaryModule } from 'src/common/Cloudinary/cloudinary.module';
import { Property } from '../properties/entities/property.entity';
import { PropertyImagesController } from './propertyImages.controller';
import { PropertyImagesService } from './propertyImages.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PropertyImages, Property]),
    CloudinaryModule,
  ],
  controllers: [PropertyImagesController],
  providers: [PropertyImagesService],
  exports: [TypeOrmModule, PropertyImagesService],
})
export class ImagesPropertyModule {}
