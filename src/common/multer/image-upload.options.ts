// src/common/multer/image-upload.options.ts
import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// 🔒 SEGURIDAD (M12): opciones comunes para TODA subida de imágenes —
// máximo 5 MB por archivo y solo mimetypes image/*. Sin esto se podía
// subir cualquier archivo de cualquier tamaño (multer bufferea en memoria).
export const imageUploadOptions: MulterOptions = {
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith('image/')) {
      return cb(
        new BadRequestException('Solo se permiten archivos de imagen (image/*)'),
        false,
      );
    }
    cb(null, true);
  },
};
