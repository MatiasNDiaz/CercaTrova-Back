import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertyImages } from './entities/ImagesPropertyEntity';
import { CloudinaryModule } from 'src/common/Cloudinary/cloudinary.module';
import { Property } from '../properties/entities/property.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PropertyImages, Property]),
    CloudinaryModule,
  ],
  exports: [
    TypeOrmModule,   // 👈 exportás los repositorios a otros módulos
  ]
})
export class ImagesPropertyModule {}
