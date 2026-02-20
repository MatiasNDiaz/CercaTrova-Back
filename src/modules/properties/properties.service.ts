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
import { Brackets, Repository } from 'typeorm';
import { PropertyType } from '../typeOfProperty/entities/typeOfProperty.entity';
import { PropertyFilterDto } from './dto/property-filter.dto';
import { CloudinaryService } from 'src/common/Cloudinary/cloudinary.service';
import { Express } from 'express';
type MulterFile = Express.Multer.File;
import { PropertyImages } from '../ImagesProperty/entities/ImagesPropertyEntity';
import { PropertyImagesService } from '../ImagesProperty/propertyImages.service'; // <- asegurate ruta correcta
import { NotificationService } from '../notifications/notifications.service';
import { StatusProperty } from './dto/enumsStatusProperty';

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

  // Traer la Localidad, Barrio y Zona para incluir los valores reales en los Selects de los filtros
  async getLocationFilters() {
  const localidades = await this.propertyRepo
    .createQueryBuilder('p')
    .select('DISTINCT p.localidad', 'localidad')
    .orderBy('p.localidad', 'ASC')
    .getRawMany();

  const barrios = await this.propertyRepo
    .createQueryBuilder('p')
    .select('DISTINCT p.barrio', 'barrio')
    .orderBy('p.barrio', 'ASC')
    .getRawMany();

  const zones = await this.propertyRepo
    .createQueryBuilder('p')
    .select('DISTINCT p.zone', 'zone')
    .orderBy('p.zone', 'ASC')
    .getRawMany();

  return {
    localidades: localidades.map(l => l.localidad).filter(Boolean),
    barrios: barrios.map(b => b.barrio).filter(Boolean),
    zones: zones.map(z => z.zone).filter(Boolean),
  };
}

  // ... filter() se mantiene igual que lo tenías
async filter(filters: PropertyFilterDto) {
  const {
    page = 1,
    limit = 10,
    search,
    status,
    rooms,
    bathrooms,
    minPrice,
    maxPrice,
    typeOfPropertyId,
    garage,
    patio,
    operationType,
    barrio,
    property_deed,
    localidad,
    provincia,
    zone,
    maxAntiquity,
    minM2,
    maxM2
  } = filters;

  const skip = (page - 1) * limit;

  const qb = this.propertyRepo.createQueryBuilder('p')
    .leftJoinAndSelect('p.typeOfProperty', 'type')
    .leftJoinAndSelect('p.images', 'images')
    .leftJoinAndSelect('p.agent', 'agent');

  // --- 1. PROCESAMIENTO DE BÚSQUEDA INTELIGENTE (NLP) ---
  let searchRemaining = "";
  
  if (search && search.trim() !== "") {
    let s = decodeURIComponent(search).toLowerCase()
            .replace(/²/g, '2')
            .replace(/\s+/g, ' ')
            .trim();

    // A) DETECCIÓN DE TIPOS (Prioridad nombres largos para evitar cortes en Regex)
    if (!typeOfPropertyId) {
      if (s.match(/\b(departamentos|departamento|deptos|depto)\b/i)) qb.andWhere('type.name = :tName', { tName: 'departamento' });
      else if (s.match(/\b(casas|casa)\b/i)) qb.andWhere('type.name = :tName', { tName: 'casa' });
      else if (s.match(/\b(locales|local|comercio|negocio)\b/i)) qb.andWhere('type.name = :tName', { tName: 'local' });
      else if (s.match(/\b(oficinas|oficina)\b/i)) qb.andWhere('type.name = :tName', { tName: 'oficina' });
      else if (s.match(/\b(baldío|baldio|terrenos|terreno|lotes|lote)\b/i)) qb.andWhere('type.name = :tName', { tName: 'baldío' });
    }

    // B) DETECCIÓN DE OPERACIÓN
    if (!operationType) {
      if (s.match(/\b(alquileres|alquiler|alquila|alquilo|renta)\b/i)) qb.andWhere('p.operationType = :opText', { opText: 'alquiler' });
      else if (s.match(/\b(ventas|venta|vende|vendo|comprar)\b/i)) qb.andWhere('p.operationType = :opText', { opText: 'venta' });
    }

    // C) EXTRAER METROS CUADRADOS
    const m2Match = s.match(/(\d+)\s*(metros cuadrados|metro cuadrado|metros|metro|mts|mt|m2)/i);
    if (m2Match) {
      const metros = parseInt(m2Match[1]);
      qb.andWhere('p.m2 BETWEEN :mMin AND :mMax', { mMin: metros * 0.9, mMax: metros * 1.1 });
      s = s.replace(m2Match[0], '');
    }

    

    // D) EXTRAER HABITACIONES (Orden correcto: Largo primero)
    const roomsMatch = s.match(/(\d+)\s*(habitaciones|habitacion|dormitorios|dormitorio|cuartos|cuarto|rooms|room|hab)/i);
    if (roomsMatch) {
      qb.andWhere('p.rooms = :rSearch', { rSearch: parseInt(roomsMatch[1]) });
      s = s.replace(roomsMatch[0], '');
    }

    // E) EXTRAER BAÑOS (Orden correcto: Largo primero)
    const bathsMatch = s.match(/(\d+)\s*(baños|baño|banos|bano|toilets|toilet|bañ|ban)/i);
    if (bathsMatch) {
      qb.andWhere('p.bathrooms = :bSearch', { bSearch: parseInt(bathsMatch[1]) });
      s = s.replace(bathsMatch[0], '');
    }

    // F) EXTRAER PRECIO Y ANTIGÜEDAD
    const priceMatch = s.match(/(\d+)\s*(k|mil|usd|pesos|dolares|dólares|dolar|dólar)/i);
    const priceBigMatch = s.match(/(\d{5,})/);
    if (priceMatch || priceBigMatch) {
      let val = 0; let mTxt = "";
      if (priceMatch) {
        val = parseInt(priceMatch[1]);
        if (s.includes('k') || s.includes('mil')) val *= 1000;
        mTxt = priceMatch[0];
      } else if (priceBigMatch) {
        val = parseInt(priceBigMatch[1]);
        mTxt = priceBigMatch[0];
      }
      if (val >= 1000) {
        qb.andWhere('p.price BETWEEN :pMin AND :pMax', { pMin: val * 0.8, pMax: val * 1.2 });
        s = s.replace(mTxt, '');
      }
    }

    const antiMatch = s.match(/(\d+)\s*(antigüedad|antiguedad|años|año|anos|ano)/i);
    if (antiMatch) {
      qb.andWhere('p.antiquity <= :aSearch', { aSearch: parseInt(antiMatch[1]) });
      s = s.replace(antiMatch[0], '');
    }

    // G) LIMPIEZA DE RUIDO (Añadí "en", "con", etc., para que solo quede el lugar)
    const noise = /\b(en|con|de|un|una|tenga|que|busco|necesito|casa|depto|departamento|venta|alquiler|local|oficina|baldío|baldio|habitacion|habitaciones|baño|baños|bano|banos|dormitorio|dormitorios|cuarto|cuartos|vende|alquila|metros|m2)\b/gi;
    searchRemaining = s.replace(noise, '').replace(/\s+/g, ' ').trim();
  }

  // --- 2. FILTROS EXPLÍCITOS (Los que vienen de los selectores o inputs directos) ---
  if (rooms) qb.andWhere('p.rooms = :rooms', { rooms });
  if (bathrooms) qb.andWhere('p.bathrooms = :bathrooms', { bathrooms });
  if (typeOfPropertyId) qb.andWhere('type.id = :typeId', { typeId: typeOfPropertyId });
  if (operationType) qb.andWhere('p.operationType = :opType', { opType: operationType });
  if (minPrice) qb.andWhere('p.price >= :minPrice', { minPrice });
  if (maxPrice) qb.andWhere('p.price <= :maxPrice', { maxPrice });
  if (minM2) qb.andWhere('p.m2 >= :minM2', { minM2 });
  if (maxM2) qb.andWhere('p.m2 <= :maxM2', { maxM2 });
  if (maxAntiquity) qb.andWhere('p.antiquity <= :maxAntiquity', { maxAntiquity });

  // Ubicación Manual
  if (barrio) qb.andWhere('unaccent(p.barrio) ILIKE unaccent(:barrio)', { barrio: `%${barrio}%` });
  if (localidad) qb.andWhere('unaccent(p.localidad) ILIKE unaccent(:localidad)', { localidad: `%${localidad}%` });
  if (provincia) qb.andWhere('unaccent(p.provincia) ILIKE unaccent(:provincia)', { provincia: `%${provincia}%` });
  if (zone) qb.andWhere('unaccent(p.zone) ILIKE unaccent(:zone)', {zone: `%${zone}%`,});

  // Booleanos
  if (garage !== undefined) {
    const hasGarage = String(garage) === 'true';
    qb.andWhere('p.garage = :hasGarage', { hasGarage });
  }
  if (patio !== undefined) {
    const hasPatio = String(patio) === 'true';
    qb.andWhere('p.patio = :hasPatio', { hasPatio });
  } 

  if (property_deed !== undefined) {
  const hasDeed = String(property_deed) === 'true';
  qb.andWhere('p.property_deed = :hasDeed', { hasDeed });
}

  // --- 3. BÚSQUEDA TEXTUAL (PRIORIDAD LOCALIDAD) ---
  if (searchRemaining.length >= 1) {
    qb.andWhere(new Brackets(inner => {
      // Moví Localidad y Barrio al principio para que tengan prioridad sobre el título
      inner.where("unaccent(p.localidad) ILIKE unaccent(:cs)", { cs: `%${searchRemaining}%` })
           .orWhere("unaccent(p.barrio) ILIKE unaccent(:cs)", { cs: `%${searchRemaining}%` })
           .orWhere("unaccent(p.title) ILIKE unaccent(:cs)", { cs: `%${searchRemaining}%` })
           .orWhere("unaccent(p.description) ILIKE unaccent(:cs)", { cs: `%${searchRemaining}%` });
    }));
  }

  // Solo mostrar disponibles
  qb.andWhere('p.status = :status', { status: status || StatusProperty.DISPONIBLE });

  // Paginación y Orden
  qb.orderBy('p.created_at', 'DESC')
    .skip(skip)
    .take(limit);

  const [items, total] = await qb.getManyAndCount();

  return {
    data: items,
    meta: {
      totalItems: total,
      itemCount: items.length,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
    }
  };
}


  }