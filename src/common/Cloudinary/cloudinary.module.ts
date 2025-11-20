import { Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';
import { CloudinaryConfig } from './cloudinary.config';

@Module({
  providers: [
    CloudinaryService,
    {
      provide: 'Cloudinary',
      useFactory: CloudinaryConfig,
    },
  ],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
