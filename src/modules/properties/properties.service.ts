// src/modules/properties/properties.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Property } from './entities/property.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertyType } from '../typeOfProperty/entities/typeOfProperty.entity';
import { PropertyFilterDto } from './dto/property-filter.dto';
import { CloudinaryService } from 'src/common/Cloudinary/cloudinary.service';
import { PropertyImages } from '../ImagesProperty/entities/ImagesPropertyEntity';
import { PropertyImagesService } from '../ImagesProperty/propertyImages.service'; // <- asegurate ruta correcta

@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,

    @InjectRepository(PropertyType)
    private readonly propertyTypeRepo: Repository<PropertyType>,

    @InjectRepository(PropertyImages)
    private readonly propertyImageRepository: Repository<PropertyImages>,

    private readonly cloudinaryService: CloudinaryService,

    private readonly propertyImagesService: PropertyImagesService, // inyectado
  ) {}

  // ... findAll & findOne se mantienen sin cambios (igual que tenías)
  async findAll(): Promise<any[]> {
    try {
      const properties = await this.propertyRepo.find({
        relations: ['agent', 'ratings', 'typeOfProperty', 'images'],
      });

      const result = await Promise.all(
        properties.map(async (p) => {
          const { avg } = await this.propertyRepo
            .createQueryBuilder('property')
            .leftJoin('property.ratings', 'rating')
            .select('AVG(rating.score)', 'avg')
            .where('property.id = :id', { id: p.id })
            .getRawOne();

          return { ...p, ratingAverage: Number(avg) || 0 };
        }),
      );

      return result;
    } catch (e) {
      throw new BadRequestException('No se pudieron obtener las propiedades');
    }
  }

  async findOne(id: number): Promise<any> {
    const property = await this.propertyRepo.findOne({
      where: { id },
      relations: [
        'agent',
        'comments',
        'ratings',
        'favorites',
        'requests',
        'referredBy',
        'typeOfProperty',
        'images',
      ],
    });

    if (!property) {
      throw new NotFoundException(`No existe la propiedad con ID ${id}`);
    }

    const { avg } = await this.propertyRepo
      .createQueryBuilder('property')
      .leftJoin('property.ratings', 'rating')
      .select('AVG(rating.score)', 'avg')
      .where('property.id = :id', { id })
      .getRawOne();

    return { ...property, ratingAverage: Number(avg) || 0 };
  }

  // -------------------------
  // Crear property + images
  // -------------------------
  async createWithImages(dto: CreatePropertyDto, images: Express.Multer.File[]) {
    const property = this.propertyRepo.create(dto);
    await this.propertyRepo.save(property);

    if (!images || images.length === 0)
      return { ...property, images: [] };

    // delegamos la subida / guardado de imágenes
    const savedImages = await this.propertyImagesService.createMany(property, images);

    // devolver property con imágenes creadas
    // devolver property con imágenes creadas
return {
  ...property,
  images: savedImages.map(img => ({
    id: img.id,
    url: img.url,
    hash: img.hash,
    isCover: img.isCover,
    publicId: img.publicId
  }))
};

  }

  // -------------------------
  // UPDATE property (delegando imagenes)
  // -------------------------
  async update(
    id: number,
    dto: UpdatePropertyDto,
    newImages?: Express.Multer.File[],
    deleteImagesIds?: number[],
  ): Promise<Property> {
    const property = await this.propertyRepo.findOne({
      where: { id },
      relations: ['images'],
    });

    if (!property) throw new NotFoundException(`No existe la propiedad con ID ${id}`);

    // actualizar campos de propiedad
    Object.assign(property, dto);

    // eliminar imágenes (delegado)
    if (deleteImagesIds && deleteImagesIds.length > 0) {
      await this.propertyImagesService.deleteManyByIds(deleteImagesIds);
    }

    // crear nuevas imágenes (delegado)
    if (newImages && newImages.length > 0) {
      const added = await this.propertyImagesService.createMany(property, newImages);
      // actualizar propiedad en memoria
      property.images = [...(property.images || []), ...added];
    }

    // cambiar portada (si vino en dto)
    if (dto.setCoverImageId) {
      await this.propertyImagesService.setAsCover(dto.setCoverImageId);
    }

    // asegurar portada (por si quedó sin portada)
    await this.propertyImagesService.ensureCoverExists(id);

    // salvar cambios de property (campos)
    await this.propertyRepo.save(property);

    // devolver la propiedad con imágenes actualizadas
    return this.findOne(id);
  }

  // -------------------------
  // DELETE property -> delegar eliminación de imágenes también
  // -------------------------
  async remove(id: number) {
    const property = await this.propertyRepo.findOne({
      where: { id },
      relations: ['images'],
    });

    if (!property) throw new NotFoundException(`No existe la propiedad con ID ${id}`);

    // delegar borrado de todas las imágenes (Cloudinary + DB)
    await this.propertyImagesService.deleteAllByPropertyId(id);

    // borrar la propiedad
    await this.propertyRepo.delete(id);

    return { message: `Propiedad ${id} eliminada correctamente` };
  }

  // -------------------------------------------------------------
  // eliminar una imagen individual (si todavia querés mantener endpoint en PropertiesController)
  // -------------------------------------------------------------
  async deleteImage(imageId: number) {
    // delega al servicio de imágenes — esto reasignará portada si hace falta
    return this.propertyImagesService.deleteImage(imageId);
  }

  // ... filter() se mantiene igual que lo tenías
  async filter(filters: PropertyFilterDto) {
    const qb = this.propertyRepo
      .createQueryBuilder('property')
      .leftJoinAndSelect('property.typeOfProperty', 'typeOfProperty')
      .leftJoinAndSelect('property.agent', 'agent');

    if (filters.title) {
      qb.andWhere('LOWER(property.title) LIKE LOWER(:title)', {
        title: `%${filters.title}%`,
      });
    }

    if (filters.zone) {
      qb.andWhere('LOWER(property.zone) LIKE LOWER(:zone)', {
        zone: `%${filters.zone}%`,
      });
    }

    if (filters.rooms) qb.andWhere('property.rooms = :rooms', { rooms: filters.rooms });

    if (filters.bathrooms)
      qb.andWhere('property.bathrooms = :bathrooms', {
        bathrooms: filters.bathrooms,
      });

    if (filters.garage !== undefined)
      qb.andWhere('property.garage = :garage', {
        garage: filters.garage === 'true',
      });

    if (filters.patio !== undefined)
      qb.andWhere('property.patio = :patio', {
        patio: filters.patio === 'true',
      });

    if (filters.minPrice)
      qb.andWhere('property.price >= :minPrice', {
        minPrice: filters.minPrice,
      });

    if (filters.maxPrice)
      qb.andWhere('property.price <= :maxPrice', {
        maxPrice: filters.maxPrice,
      });

    if (filters.status)
      qb.andWhere('property.status = :status', { status: filters.status });

    if (filters.typeOfPropertyId)
      qb.andWhere('typeOfProperty.id = :typeOfPropertyId', {
        typeOfPropertyId: filters.typeOfPropertyId,
      });

    return qb.getMany();
  }
}
