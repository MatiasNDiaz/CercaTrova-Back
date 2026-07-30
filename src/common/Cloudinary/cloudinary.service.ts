import { Injectable, Inject, Logger } from '@nestjs/common';
import { UploadApiResponse, UploadApiErrorResponse, v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(
    @Inject('Cloudinary') private cloudinary,
  ) {}

  /**
   * `folder` es opcional y por defecto sigue siendo 'properties', así los
   * llamados que ya existían no cambian de comportamiento. Las publicaciones
   * (`posts`) pasan su propia carpeta para no mezclarse con las propiedades.
   */
  uploadImage(file: Express.Multer.File, folder = 'properties'): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const upload = this.cloudinary.uploader.upload_stream(
        {
          folder,
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
    // (ERROR_FIXES R-22): destroy() no lanza si el archivo no existe —
    // devuelve { result: 'not found' }. Verificamos y logueamos el no-op
    // en vez de asumir éxito en silencio.
    const response = await this.cloudinary.uploader.destroy(publicId);
    if (response?.result !== 'ok') {
      this.logger.warn(
        `Cloudinary no eliminó "${publicId}" (resultado: ${response?.result ?? 'desconocido'})`,
      );
    }
    return response;
  }
}
