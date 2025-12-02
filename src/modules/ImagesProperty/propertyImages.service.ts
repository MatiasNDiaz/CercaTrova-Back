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

    // Crear entidades
    const entities = uploads.map((u, index) =>
      this.imagesRepo.create({
        property,
        url: u.secure_url,
        publicId: u.public_id,
        hash: u.asset_id,
        isCover: hasCover ? false : index === 0,
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
  // SET AS COVER (existing single image)
  // -------------------------------------------------------------------------
  async setAsCover(imageId: number) {
    const image = await this.imagesRepo.findOne({
      where: { id: imageId },
      relations: ['property'],
    });

    if (!image) throw new NotFoundException('Imagen no encontrada');

    const propertyId = image.property.id;

    // 1) Poner todas las imágenes de esa propiedad en false
    await this.imagesRepo.update(
      { property: { id: propertyId } },
      { isCover: false },
    );

    // 2) Marcar esta imagen como portada
    image.isCover = true;
    await this.imagesRepo.save(image);

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
  // Si no hay portada para la propiedad, asigna la primera (order by id asc)
  // -------------------------------------------------------------------------
  async ensureCoverExists(propertyId: number) {
    const images = await this.imagesRepo.find({
      where: { property: { id: propertyId } },
      order: { id: 'ASC' },
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
      order: { id: 'ASC' },
    });

    if (images.length === 0) return;

    const next = images[0];
    next.isCover = true;

    await this.imagesRepo.save(next);
  }
}
