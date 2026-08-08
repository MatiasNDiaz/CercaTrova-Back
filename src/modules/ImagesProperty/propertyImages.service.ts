// src/modules/ImagesProperty/propertyImages.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PropertyImages } from './entities/ImagesPropertyEntity';
import { Property } from '../properties/entities/property.entity';
import { CloudinaryService } from 'src/common/Cloudinary/cloudinary.service';

@Injectable()
export class PropertyImagesService {
  constructor(
    @InjectRepository(PropertyImages)
    private readonly imagesRepo: Repository<PropertyImages>,

    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,

    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // -------------------------------------------------------------------------
  // GET ONE IMAGE
  // -------------------------------------------------------------------------
  async findOne(id: number) {
    const img = await this.imagesRepo.findOne({
      where: { id },
      relations: ['property'],
    });

    if (!img) throw new NotFoundException('Imagen no encontrada');
    return img;
  }

  // -------------------------------------------------------------------------
  // CREATE MANY IMAGES: subir a cloudinary + guardar registros
  // -------------------------------------------------------------------------
  async createMany(property: Property, files: Express.Multer.File[]) {
    if (!files || files.length === 0) return [];

    // Subir a Cloudinary
    const uploads = await Promise.all(
      files.map((file) => this.cloudinaryService.uploadImage(file)),
    );

    // Check if property already has a cover
    const existingImages = await this.imagesRepo.find({
      where: { property: { id: property.id } },
    });
    const hasCover = existingImages.some(img => img.isCover);

    // Las nuevas se encolan DESPUÉS de las que ya estaban: al editar una
    // propiedad y sumar fotos, las existentes no se mueven de lugar. El máximo
    // se calcula sobre las filas reales y no sobre `existingImages.length`
    // porque los borrados dejan huecos en la secuencia (borrar la del medio no
    // renumera al resto).
    const nextOrder = existingImages.length > 0
      ? Math.max(...existingImages.map(img => img.order ?? 0)) + 1
      : 0;

    // Crear entidades
    const entities = uploads.map((u, index) =>
      this.imagesRepo.create({
        property,
        url: u.secure_url,
        publicId: u.public_id,
        hash: u.asset_id,
        isCover: hasCover ? false : index === 0,
        order: nextOrder + index,
      }),
    );

    // Guardar y devolver
    const saved = await this.imagesRepo.save(entities);

    // Si no había portada y guardamos nuevas imágenes: aseguramos que exista portada
    if (!hasCover) {
      // si por alguna razón ninguna quedó isCover true, ponemos la primera
      if (!saved.some(s => s.isCover)) {
        saved[0].isCover = true;
        await this.imagesRepo.save(saved[0]);
      }
    }

    return saved;
  }

  // -------------------------------------------------------------------------
  // DELETE MANY IMAGES BY IDS: borra en cloudinary y en BD
  // -------------------------------------------------------------------------
  async deleteManyByIds(ids: number[]) {
    if (!ids || ids.length === 0) return { deleted: 0 };

    const imgs = await this.imagesRepo.find({
      where: { id: In(ids) },
      relations: ['property'],
    });

    if (imgs.length === 0) return { deleted: 0 };

    // Borrar en Cloudinary en paralelo
    await Promise.all(imgs.map(i => this.cloudinaryService.deleteFile(i.publicId)));

    // Guard property ids to check cover fallback after deletion
    const propertyIds = Array.from(new Set(imgs.map(i => i.property?.id).filter(Boolean)));

    // Borrar de la BD
    await this.imagesRepo.delete(ids);

    // Por cada propiedad afectada, asegurar portada (si corresponde)
    for (const pid of propertyIds) {
      await this.ensureCoverExists(pid);
    }

    return { deleted: imgs.length };
  }

  // -------------------------------------------------------------------------
  // DELETE ALL IMAGES OF A PROPERTY (used when deleting property)
  // -------------------------------------------------------------------------
  async deleteAllByPropertyId(propertyId: number) {
    const imgs = await this.imagesRepo.find({
      where: { property: { id: propertyId } },
    });

    if (!imgs || imgs.length === 0) return { deleted: 0 };

    await Promise.all(imgs.map(i => this.cloudinaryService.deleteFile(i.publicId)));

    await this.imagesRepo.delete({ property: { id: propertyId } });

    return { deleted: imgs.length };
  }

  // -------------------------------------------------------------------------
  // REORDER: persiste el orden completo de la galería de una propiedad
  // -------------------------------------------------------------------------
  /**
   * Reordena TODAS las imágenes de una propiedad de una sola vez.
   *
   * Recibe los ids en el orden deseado y asigna `order = índice`. La imagen que
   * queda en la posición 0 pasa a ser la portada, manteniendo la invariante
   * documentada en la entidad.
   *
   * ## Por qué exige la lista COMPLETA
   *
   * Se valida que `imageIds` contenga exactamente las imágenes de la propiedad
   * —ni de más, ni de menos, sin repetidos— y se responde 400 si no. Aceptar un
   * subconjunto obligaría a inventar una regla para las que faltan (¿al final?,
   * ¿conservan su orden viejo, que ahora choca con los nuevos índices?), y esa
   * regla implícita es justo el tipo de cosa que después nadie recuerda. Con la
   * lista completa el estado resultante es siempre 0..n-1 sin huecos.
   *
   * También corta un IDOR silencioso: sin el chequeo de pertenencia, mandar el
   * id de una imagen de OTRA propiedad la reasignaría de orden (y podría
   * marcarla como portada) desde la URL de esta.
   *
   * ## Por qué en una transacción
   *
   * Son N updates de `order` más el traspaso de `isCover`. Si el proceso muere
   * en el medio, la galería queda con órdenes duplicados y, peor, con dos
   * portadas o ninguna. La transacción hace que se apliquen todos o ninguno.
   */
  async reorder(propertyId: number, imageIds: number[]) {
    const property = await this.propertyRepo.findOne({ where: { id: propertyId } });
    if (!property) {
      throw new NotFoundException(`No existe la propiedad con ID ${propertyId}`);
    }

    const images = await this.imagesRepo.find({
      where: { property: { id: propertyId } },
    });

    if (images.length === 0) {
      throw new NotFoundException('La propiedad no tiene imágenes para reordenar');
    }

    const unique = new Set(imageIds);
    if (unique.size !== imageIds.length) {
      throw new BadRequestException('El orden tiene imágenes repetidas');
    }

    const owned = new Set(images.map(img => img.id));
    if (imageIds.length !== owned.size || imageIds.some(id => !owned.has(id))) {
      throw new BadRequestException(
        `El orden tiene que incluir exactamente las ${owned.size} imágenes de la propiedad`,
      );
    }

    await this.imagesRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(PropertyImages);
      for (const [index, id] of imageIds.entries()) {
        // `update` por id y no `save(entity)`: el entity trae cargada la
        // relación `property`, y un save completo reescribiría columnas que
        // esta operación no tiene por qué tocar.
        await repo.update(id, { order: index, isCover: index === 0 });
      }
    });

    // Se recorre `images` (las entidades reales) y no `imageIds`, para no tener
    // que buscar cada id en un Map y afirmar que existe: la validación de arriba
    // ya garantiza que los dos conjuntos son idénticos, así que `indexOf` nunca
    // devuelve -1. Con 10 imágenes como máximo, el costo es irrelevante.
    return {
      message: 'Orden de las imágenes actualizado correctamente.',
      images: images
        .map(img => ({
          id: img.id,
          order: imageIds.indexOf(img.id),
          isCover: imageIds.indexOf(img.id) === 0,
          url: img.url,
        }))
        .sort((a, b) => a.order - b.order),
    };
  }

  // -------------------------------------------------------------------------
  // SET AS COVER (existing single image)
  // -------------------------------------------------------------------------
  /**
   * Marca una imagen como portada.
   *
   * ⚠️ Ahora TAMBIÉN la mueve a la posición 0 y corre una posición al resto.
   * Antes solo tocaba `isCover`, pero con el campo `order` eso dejaría la
   * portada en el medio de la galería: la tarjeta del catálogo mostraría una
   * foto y el detalle abriría con otra. Mantiene la invariante
   * "`order = 0` ⇔ `isCover`" descrita en la entidad.
   */
  async setAsCover(imageId: number) {
    const image = await this.imagesRepo.findOne({
      where: { id: imageId },
      relations: ['property'],
    });

    if (!image) throw new NotFoundException('Imagen no encontrada');

    // (ERROR_FIXES R-23): guard contra relación rota — antes reventaba con
    // TypeError → 500 si la imagen quedó sin property asociada
    if (!image.property) {
      throw new NotFoundException('La imagen no tiene una propiedad asociada');
    }

    const propertyId = image.property.id;

    // La nueva portada primero; el resto conserva su orden relativo detrás.
    const images = await this.imagesRepo.find({
      where: { property: { id: propertyId } },
      order: { order: 'ASC', id: 'ASC' },
    });
    const nuevoOrden = [
      imageId,
      ...images.filter(img => img.id !== imageId).map(img => img.id),
    ];

    await this.imagesRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(PropertyImages);
      for (const [index, id] of nuevoOrden.entries()) {
        await repo.update(id, { order: index, isCover: index === 0 });
      }
    });

    image.isCover = true;
    image.order = 0;

    return {
      message: 'Imagen establecida como portada correctamente.',
      image,
    };
  }

  // -------------------------------------------------------------------------
  // DELETE single image (existing)
  // -------------------------------------------------------------------------
  async deleteImage(imageId: number) {
    const image = await this.imagesRepo.findOne({
      where: { id: imageId },
      relations: ['property'],
    });

    if (!image) throw new NotFoundException('Imagen no encontrada');

    // 1) Eliminar de Cloudinary
    await this.cloudinaryService.deleteFile(image.publicId);

    // 2) Eliminar de la base de datos
    await this.imagesRepo.remove(image);

    // 3) Si la imagen eliminada era portada → asignar otra portada automáticamente
    if (image.isCover && image.property?.id) {
      await this.setNextImageAsCover(image.property.id);
    }

    return { message: 'Imagen eliminada correctamente.' };
  }

  // -------------------------------------------------------------------------
  // Si no hay portada para la propiedad, asigna la primera de la galería
  // -------------------------------------------------------------------------
  /**
   * ⚠️ El criterio de "la primera" pasó de `id ASC` a `order ASC` (con `id` como
   * desempate para las filas que todavía tengan el `order: 0` por defecto de la
   * migración). Con `id ASC` la portada de reemplazo era la foto más vieja, que
   * después del drag & drop puede estar última en la galería.
   */
  async ensureCoverExists(propertyId: number) {
    const images = await this.imagesRepo.find({
      where: { property: { id: propertyId } },
      order: { order: 'ASC', id: 'ASC' },
    });

    if (images.length === 0) return;

    if (!images.some(img => img.isCover)) {
      images[0].isCover = true;
      await this.imagesRepo.save(images[0]);
    }
  }

  // privado para uso interno después de deleteImage()
  private async setNextImageAsCover(propertyId: number) {
    const images = await this.imagesRepo.find({
      where: { property: { id: propertyId } },
      order: { order: 'ASC', id: 'ASC' },
    });

    if (images.length === 0) return;

    const next = images[0];
    next.isCover = true;

    await this.imagesRepo.save(next);
  }
}
