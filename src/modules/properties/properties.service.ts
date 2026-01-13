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
  // 0) Mapear typeOfProperty si viene en el DTO
  if (dto.typeOfPropertyId) {
    const type = await this.propertyTypeRepo.findOne({ where: { id: dto.typeOfPropertyId } });
    if (!type) {
      throw new NotFoundException(`No existe el tipo de propiedad con ID ${dto.typeOfPropertyId}`);
    }
    // Asignar objeto completo al DTO para que TypeORM cree la relación
    (dto as any).typeOfProperty = type;
  }

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
      'agent',           
      'referredBy'
    ],
  });

  if (!fullProperty) {
    throw new NotFoundException('Error interno: no se pudo recargar la propiedad');
  }

  // 5) Disparar notificaciones en background
  this.notificationService.handleNewProperty(fullProperty).catch(err => {
    console.error('Error enviando notificaciones para propiedad recién creada:', err);
  });

  // 6) Devolver la representación del recurso creada
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
  const { 
    page, limit, title, zone, rooms, provincia, localidad, barrio, bathrooms, garage, patio, 
    minPrice, maxPrice, minM2, maxM2, hasDeed, typeOfPropertyId, status, operationType
  } = filters;

  // 1. Calculamos el salto (skip) para la paginación
  if(!page || !limit) {
    throw new BadRequestException('page y limit son obligatorios para la paginación');
  }
  const skip = (page - 1) * limit;

  // 2. Iniciamos el QueryBuilder
  const qb = this.propertyRepo.createQueryBuilder('property')
    .leftJoinAndSelect('property.typeOfProperty', 'type')
    .leftJoinAndSelect('property.images', 'images')
    .leftJoinAndSelect('property.agent', 'agent')
    // Agregamos el promedio de ratings directamente
    .leftJoin('property.ratings', 'r')
    .addSelect('AVG(r.score)', 'property_ratingAverage')
    .groupBy('property.id')
    .addGroupBy('type.id')
    .addGroupBy('images.id')
    .addGroupBy('agent.id');

  // --- FILTROS DE TEXTO INTELIGENTES ---
  if (title) {
    // Usamos ILIKE (Postgres) para que no importe mayúsculas/minúsculas
    qb.andWhere('property.title ILIKE :title', { title: `%${title}%` });
  }

  if (zone) {
    qb.andWhere('property.zone ILIKE :zone', { zone: `%${zone}%` });
  }

  // --- NUEVA LÓGICA DE UBICACIÓN ---
  if (provincia) {
    qb.andWhere('property.provincia ILIKE :provincia', { provincia: `%${provincia}%` });
  }

  if (localidad) {
    qb.andWhere('property.localidad ILIKE :localidad', { localidad: `%${localidad}%` });
  }

  if (barrio) {
    qb.andWhere('property.barrio ILIKE :barrio', { barrio: `%${barrio}%` });
  }
  // --- FILTROS DE RANGO ---
  if (minPrice) qb.andWhere('property.price >= :minPrice', { minPrice });
  if (maxPrice) qb.andWhere('property.price <= :maxPrice', { maxPrice });

  if (minM2) qb.andWhere('property.m2 >= :minM2', { minM2 });
  if (maxM2) qb.andWhere('property.maxM2 <= :maxM2', { maxM2 });

  // --- FILTROS EXACTOS ---
  if (rooms) qb.andWhere('property.rooms = :rooms', { rooms });
  if (bathrooms) qb.andWhere('property.bathrooms = :bathrooms', { bathrooms });
  
  if (typeOfPropertyId) {
    qb.andWhere('type.id = :typeId', { typeId: typeOfPropertyId });
  }

  // --- NUEVO FILTRO: TIPO DE OPERACIÓN ---
    if (operationType) {
      qb.andWhere('property.operationType = :operationType', { operationType }); // 👈 Agregado aquí
    }

  // --- FILTROS BOOLEANOS ---
  // Convertimos el string 'true'/'false' de la URL a booleano real
  if (garage !== undefined) {
    qb.andWhere('property.garage = :garage', { garage: garage === 'true' });
  }
  if (patio !== undefined) {
    qb.andWhere('property.patio = :patio', { patio: patio === 'true' });
  }
  if (hasDeed !== undefined) {
    qb.andWhere('property.property_deed = :hasDeed', { hasDeed: hasDeed === 'true' });
  }

  // --- LÓGICA DE ESTADO (SEGURIDAD) ---
  if (status) {
    qb.andWhere('property.status = :status', { status });
  } else {
    // Si no pide un estado, solo mostramos las disponibles por defecto
    qb.andWhere('property.status = :defaultStatus', { defaultStatus: 'available' });
  }

  // --- PAGINACIÓN Y EJECUCIÓN ---
  qb.orderBy('property.created_at', 'DESC') // Lo más nuevo primero
    .skip(skip)
    .take(limit);

  // getManyAndCount nos da los registros y el total para el Frontend
  const [items, total] = await qb.getManyAndCount();

  // 4. Retornamos objeto paginado profesional
  return {
    data: items,
    meta: {
      totalItems: total,
      itemCount: items.length,
      itemsPerPage: limit,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    }
  };
}
  }