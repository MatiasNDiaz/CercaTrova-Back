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
import { Express } from 'express';
type MulterFile = Express.Multer.File;
import { PropertyImages } from '../ImagesProperty/entities/ImagesPropertyEntity';
import { PropertyImagesService } from '../ImagesProperty/propertyImages.service'; // <- asegurate ruta correcta
import { NotificationService } from '../notifications/notifications.service';

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
    
    private readonly notificationService: NotificationService,
    
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
  async createWithImages(dto: CreatePropertyDto, images: MulterFile[]) {
  // 1) Crear y salvar la propiedad básica
  const property = this.propertyRepo.create(dto);
      await this.propertyRepo.save(property);

      // 2) Si no hay imágenes, recargar y devolvemos inmediatamente
      if (!images || images.length === 0) {
        const minimal = await this.propertyRepo.findOne({
          where: { id: property.id },
          relations: ['typeOfProperty', 'images', 'agent']
        });
        return {
          ...property,
          images: minimal?.images ?? []
        };
      }
    
      // 3) Subir y guardar imágenes (delegado)
      const savedImages = await this.propertyImagesService.createMany(property, images);
      property.images = savedImages;
    
      // 4) Recargar la propiedad COMPLETA con relaciones necesarias para el mail
      const fullProperty = await this.propertyRepo.findOne({
        where: { id: property.id },
        relations: [
          'typeOfProperty',
          'images',
          'agent',           // por si querés usar datos del agente en el template
          'referredBy'
        ],
      });
    
      if (!fullProperty) {
        // esto es raro, pero devolvemos algo lógico y loggeamos
        throw new NotFoundException('Error interno: no se pudo recargar la propiedad');
      }
    
      // 5) Disparar notificaciones en background (no bloquea la respuesta)
      // NotificationService ya guarda notificaciones en BD antes de enviar emails (seguro).
      this.notificationService.handleNewProperty(fullProperty).catch(err => {
        // Loggear y seguir: no queremos que fallen los mails rompan la creación
        console.error('Error enviando notificaciones para propiedad recién creada:', err);
      });
    
      // 6) Devolver la representación del recurso creada (sin bloquear por emails)
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
  newImages?: MulterFile[],
  deleteImagesIds?: number[],
): Promise<Property> {
  const property = await this.propertyRepo.findOne({
    where: { id },
    relations: ['images', 'typeOfProperty', 'agent']
  });

  if (!property) throw new NotFoundException(`No existe la propiedad con ID ${id}`);

  // Capturar precio antiguo ANTES de cambiar
  const oldPrice = property.price;

  // Actualizar campos (no persistir todavía)
  Object.assign(property, dto);

  // Manejo de imágenes (eliminación y adición)
  if (deleteImagesIds && deleteImagesIds.length > 0) {
    await this.propertyImagesService.deleteManyByIds(deleteImagesIds);
    // actualizar referencia en memoria si querés
    property.images = property.images?.filter(i => !deleteImagesIds.includes(i.id));
  }

  if (newImages && newImages.length > 0) {
    const added = await this.propertyImagesService.createMany(property, newImages);
    property.images = [...(property.images || []), ...added];
  }

  if (dto.setCoverImageId) {
    await this.propertyImagesService.setAsCover(dto.setCoverImageId);
  }

  await this.propertyImagesService.ensureCoverExists(id);

  // Guardar cambios
  await this.propertyRepo.save(property);

  // Notificar si cambió el precio: hacemos el handle después del save y en background
  if (dto.price && dto.price !== oldPrice) {
    this.notificationService.handlePriceChange(property, oldPrice).catch(err => {
      console.error('Error notificando baja de precio:', err);
    });
  }

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
