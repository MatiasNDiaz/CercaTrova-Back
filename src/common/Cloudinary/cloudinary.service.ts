import { Injectable, Inject } from '@nestjs/common';
import { UploadApiResponse, UploadApiErrorResponse, v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor(
    @Inject('Cloudinary') private cloudinary,
  ) {}

  uploadImage(file: Express.Multer.File): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const upload = this.cloudinary.uploader.upload_stream(
        {
          folder: 'properties',
        },
        (error: UploadApiErrorResponse, result: UploadApiResponse) => {
          if (error) return reject(error);  
          resolve(result);  
        },
      );

      upload.end(file.buffer);
    });
  }

  async deleteFile(publicId: string) {
  return await this.cloudinary.uploader.destroy(publicId);
}
}
