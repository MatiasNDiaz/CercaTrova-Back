import { Injectable, Inject, Logger } from '@nestjs/common';
import { UploadApiResponse, UploadApiErrorResponse, v2 as cloudinary } from 'cloudinary';

/** Lo que se usa de `api.resource(..., { resource_type: 'video' })`. */
interface CloudinaryVideoResource {
  public_id: string;
  secure_url: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  duration?: number;
  asset_folder?: string;
}

/** Lo que se usa de `api.resources(...)` (listado paginado). */
interface CloudinaryResourceList {
  resources?: { public_id: string; created_at: string }[];
  next_cursor?: string;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(
    @Inject('Cloudinary') private cloudinary,
  ) {}

  /**
   * El mismo cliente inyectado, pero TIPADO. El provider `'Cloudinary'`
   * devuelve el `v2` del SDK ya configurado (`cloudinary.config.ts`); la
   * inyección quedó sin tipo, así que los métodos nuevos pasan por acá para
   * tener chequeo de tipos en vez de `any`.
   */
  private get sdk(): typeof cloudinary {
    return this.cloudinary as typeof cloudinary;
  }

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


  /**
   * `resourceType` es opcional y por defecto 'image', así los llamados que ya
   * existían no cambian. ⚠️ Un VIDEO hay que borrarlo con 'video': `destroy()`
   * busca el `public_id` solo dentro del tipo que se le pasa, y con el default
   * devuelve 'not found' sin borrar nada.
   */
  async deleteFile(publicId: string, resourceType: 'image' | 'video' = 'image') {
    // (ERROR_FIXES R-22): destroy() no lanza si el archivo no existe —
    // devuelve { result: 'not found' }. Verificamos y logueamos el no-op
    // en vez de asumir éxito en silencio.
    const response = await this.cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      // Sin esto Cloudinary puede seguir sirviendo la copia cacheada en su CDN
      // un rato después de borrado el original.
      invalidate: true,
    });
    if (response?.result !== 'ok') {
      this.logger.warn(
        `Cloudinary no eliminó "${publicId}" (resultado: ${response?.result ?? 'desconocido'})`,
      );
    }
    return response;
  }

  // ---------------------------------------------------------------
  // VIDEOS — subida directa desde el navegador, firmada acá
  // ---------------------------------------------------------------
  /**
   * Firma una subida de VIDEO que el navegador hace directo a Cloudinary.
   *
   * ¿Por qué no pasa por este servidor, como las imágenes? Porque en
   * producción el navegador llega al backend a través del proxy de Vercel
   * (`/api/*`), con un timeout de 15s en axios, y multer bufferea cada archivo
   * entero en memoria. Un video de 80 MB no sobreviviría a ninguno de los tres.
   *
   * Seguridad:
   *  - El `api_secret` NUNCA sale de acá: se devuelve solo la firma (un hash de
   *    los parámetros) y el `api_key`, que es público por diseño de Cloudinary.
   *  - La firma FIJA `folder` y `allowed_formats`: el navegador no puede cambiar
   *    la carpeta ni subir otro formato sin invalidarla.
   *  - Vence sola: Cloudinary rechaza firmas con `timestamp` de más de 1 hora.
   *  - Quien la pide tiene que ser admin (lo exige el controller).
   */
  signVideoUpload(folder: string, allowedFormats: readonly string[]) {
    const { cloud_name, api_key, api_secret } = this.sdk.config();
    if (!cloud_name || !api_key || !api_secret) {
      // El mensaje queda en el log del servidor; al cliente le llega un 502
      // genérico (ver `PostsService.getVideoUploadSignature`).
      throw new Error('Cloudinary no está configurado (faltan CLOUDINARY_* en el entorno)');
    }

    const timestamp = Math.round(Date.now() / 1000);
    const paramsToSign = {
      timestamp,
      folder,
      allowed_formats: allowedFormats.join(','),
    };
    const signature = this.sdk.utils.api_sign_request(paramsToSign, api_secret);

    return {
      cloudName: cloud_name,
      apiKey: api_key,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloud_name}/video/upload`,
      timestamp,
      folder,
      allowedFormats: paramsToSign.allowed_formats,
      signature,
    };
  }

  /**
   * Datos reales de un video ya subido (formato, peso, dimensiones, duración).
   *
   * Es lo que permite NO confiar en lo que diga el cliente: al guardar una
   * publicación, el backend le pregunta a Cloudinary qué hay detrás de cada
   * `public_id` recibido. Devuelve `null` si no existe.
   */
  async getVideoResource(publicId: string): Promise<{
    publicId: string;
    secureUrl: string;
    format: string;
    bytes: number;
    width: number | null;
    height: number | null;
    duration: number | null;
    assetFolder: string | null;
  } | null> {
    try {
      // Los tipos del SDK no declaran `duration` ni `asset_folder` en esta
      // respuesta (sí vienen en el JSON real), por eso el shape propio.
      const r = (await this.sdk.api.resource(publicId, {
        resource_type: 'video',
      })) as unknown as CloudinaryVideoResource;
      return {
        publicId: r.public_id,
        secureUrl: r.secure_url,
        format: String(r.format ?? '').toLowerCase(),
        bytes: Number(r.bytes ?? 0),
        width: typeof r.width === 'number' ? r.width : null,
        height: typeof r.height === 'number' ? r.height : null,
        duration: typeof r.duration === 'number' ? r.duration : null,
        // Solo existe en cuentas con "dynamic folders"; en las de carpetas
        // fijas la carpeta va como prefijo del `public_id`.
        assetFolder: r.asset_folder ?? null,
      };
    } catch (error) {
      // La Admin API responde 404 como error lanzado (`http_code: 404`).
      const httpCode = (error as { error?: { http_code?: number } })?.error?.http_code;
      if (httpCode === 404) return null;
      throw error;
    }
  }

  /**
   * Fotograma inicial del video como JPG, para el `poster` del reproductor y
   * para la portada de la publicación. No se genera ni se guarda ningún
   * archivo: es una URL de transformación que Cloudinary resuelve al pedirla
   * (y cachea en su CDN). `c_limit,w_1080` evita servir un 4K como miniatura.
   */
  videoPosterUrl(publicId: string): string {
    return this.sdk.url(publicId, {
      resource_type: 'video',
      format: 'jpg',
      secure: true,
      transformation: [{ start_offset: 0 }, { width: 1080, crop: 'limit', quality: 'auto' }],
    });
  }

  /**
   * `public_id` de los videos de una carpeta subidos antes de `olderThan`.
   *
   * Para el barrido de huérfanos: un video que el admin subió desde el
   * formulario pero nunca llegó a guardarse en una publicación (cerró la
   * pestaña, lo quitó antes de publicar, falló la red…). El navegador no puede
   * borrarlo por su cuenta — no tiene el secreto — así que lo limpia el cron.
   */
  async listVideosOlderThan(prefix: string, olderThan: Date): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | undefined;
    // Tope de páginas: con 500 por página alcanza de sobra para este uso, y
    // evita un bucle largo si la Admin API devolviera cursores raros.
    for (let page = 0; page < 10; page++) {
      const res = (await this.sdk.api.resources({
        type: 'upload',
        resource_type: 'video',
        prefix,
        max_results: 500,
        ...(cursor ? { next_cursor: cursor } : {}),
      })) as unknown as CloudinaryResourceList;
      for (const r of res.resources ?? []) {
        if (new Date(r.created_at) < olderThan) ids.push(r.public_id);
      }
      cursor = res.next_cursor;
      if (!cursor) break;
    }
    return ids;
  }
}
