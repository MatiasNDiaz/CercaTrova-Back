/**
 * Límites de los medios de una publicación — ÚNICA fuente de verdad.
 *
 * El frontend no los duplica a mano: los recibe junto con la firma de subida
 * (`POST /posts/media/video-signature`), así que si se cambian acá, cambian en
 * los dos lados.
 *
 * ── Por qué estos números ──────────────────────────────────────────────────
 * · Imágenes: 5 MB, el mismo tope que ya imponía `imageUploadOptions` para
 *   TODA subida de imágenes del sistema. No se toca.
 * · Videos: 100 MB por archivo. Es el máximo que acepta Cloudinary para un
 *   video en el plan gratuito (en planes pagos es mayor). Los videos NO pasan
 *   por este servidor — se suben directo del navegador a Cloudinary con una
 *   firma (ver `CloudinaryService.signVideoUpload`) — así que no hay límite de
 *   memoria de multer, de cuerpo del proxy de Vercel ni del timeout de 15s de
 *   axios que aplique.
 * · Formatos: MP4 y WebM, los dos que reproduce `<video>` en todos los
 *   navegadores actuales sin transcodificar. MOV (iPhone) queda afuera a
 *   propósito: Chrome/Firefox no siempre lo reproducen, y convertirlo requiere
 *   transformaciones de Cloudinary que tienen sus propios topes de tamaño.
 * · 10 medios por publicación (como las propiedades), de los cuales hasta 3
 *   videos: un video pesa mucho más que una foto para quien navega en el
 *   celular, y el feed se carga entero.
 */
export const POST_MEDIA_LIMITS = {
  maxImageBytes: 5 * 1024 * 1024,
  maxVideoBytes: 100 * 1024 * 1024,
  videoFormats: ['mp4', 'webm'] as const,
  maxMediaPerPost: 10,
  maxVideosPerPost: 3,
} as const;

/**
 * Carpeta de Cloudinary de los videos de publicaciones. La firma de subida la
 * fija, y al guardar se rechaza cualquier `public_id` que no esté adentro: así
 * el cliente no puede asociar a una publicación un recurso ajeno (una foto de
 * propiedad, el video de otra publicación, etc.).
 */
export const POST_VIDEO_FOLDER = 'posts/videos';

/** Carpeta de las imágenes de publicaciones (la que ya se usaba). */
export const POST_IMAGE_FOLDER = 'posts';
