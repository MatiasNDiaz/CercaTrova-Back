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

  // NUEVO MÉTODO PARA PERFILES
  uploadProfilePhoto(file: Express.Multer.File, userId: number): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const upload = this.cloudinary.uploader.upload_stream(
        {
          folder: 'userPhotoProfile',
          public_id: `user_${userId}`, // Nombre fijo basado en el ID
          overwrite: true,               // Sobreescribe si ya existe
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' } // Lo hace cuadrado y centra la cara
          ],
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
