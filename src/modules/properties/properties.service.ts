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
  ) {}

  // 🟡 Obtener todas las propiedades 
  async findAll(): Promise<any[]> {
    try {
      const properties = await this.propertyRepo.find({
        relations: ['agent', 'ratings', 'typeOfProperty', 'images'  ],
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
  
  // 🟡 Obtener una propiedad 
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
  
  
  // 🟢 Crear una propiedad + sus imagenes
  async createWithImages(
    dto: CreatePropertyDto,
    images: Express.Multer.File[],
    ) {
    // Crear la propiedad
    const property = this.propertyRepo.create(dto);
    await this.propertyRepo.save(property);

    if (!images || images.length === 0)
      return { ...property, images: [] };

    // Subir imágenes
    const uploads = await Promise.all(
      images.map((file) => this.cloudinaryService.uploadImage(file)),
    );

    // Crear registros
    const propertyImages = uploads.map((img) =>
      this.propertyImageRepository.create({
        property,
        url: img.secure_url,
        publicId: img.public_id,
        hash: img.asset_id, // opcional: puedes usar tu hash crypto
      }),
    );

    await this.propertyImageRepository.save(propertyImages);

    return {
      ...property,
      images: propertyImages,
    };
  }

  // 🟠 Actualizar datos de propiedades
  async update(id: number, dto: UpdatePropertyDto): Promise<Property> {
    const property = await this.findOne(id);
    if (dto.typeOfPropertyId) {
      const newType = await this.propertyTypeRepo.findOne({
        where: { id: dto.typeOfPropertyId },
      });

      if (!newType) {
        throw new NotFoundException(
          `El tipo de propiedad con ID ${dto.typeOfPropertyId} no existe`,
        );
      }

      property.typeOfProperty = newType;
    }

    Object.assign(property, dto);

    return await this.propertyRepo.save(property);
    } 

  // 🔴 Eliminar propiedad + imágenes en BD + imágenes en Cloudinary
  async remove(id: number) {
    // Buscar la propiedad con sus imágenes
    const property = await this.propertyRepo.findOne({
      where: { id },
      relations: ['images'], // 🔥 MUY IMPORTANTE
    });

    if (!property) {
      throw new NotFoundException(`No existe la propiedad con ID ${id}`);
    }

    // 1. 🔥 Borrar imágenes de Cloudinary
    if (property.images && property.images.length > 0) {
      for (const img of property.images) {
        if (img.publicId) {
          await this.cloudinaryService.deleteFile(img.publicId);
        }
      }
    }

    // 2. 🔥 Borrar imágenes de la BD (aunque cascade también las borra, lo hacemos manual por control)
    await this.propertyImageRepository.delete({ property: { id } });

    // 3. 🔥 Borrar propiedad
    await this.propertyRepo.delete(id);
    return { message: `Propiedad ${id} eliminada correctamente` };
  }

    // 🔴 Eliminar las imagenes de una propiedad
    async deleteImage(imageId: number) {
    const image = await this.propertyImageRepository.findOne({
      where: { id: imageId },
    });

    if (!image) {
      throw new NotFoundException('Imagen no encontrada');
    }

    // 1. Borrar de Cloudinary
    await this.cloudinaryService.deleteFile(image.publicId);

    // 2. Borrar de la base de datos
    await this.propertyImageRepository.delete(imageId);

    return {
      message: 'Imagen eliminada correctamente',
      id: imageId,
    };
  }

  // 🔍 Filtros de propiedades (se pueden combinar los filtros)
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
