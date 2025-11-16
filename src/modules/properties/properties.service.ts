import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Property } from './entities/property.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
  ) {}

  /** ✅ Crear propiedad */
  async create(createPropertyDto: CreatePropertyDto): Promise<Property> {
    try {
      const property = this.propertyRepo.create(createPropertyDto);
      return await this.propertyRepo.save(property);
    } catch (error) {
      throw new BadRequestException('No se pudo crear la propiedad');
    }
  }

  /** ✅ Obtener todas con promedio de rating */
  async findAll(): Promise<any[]> {
    try {
      // Traemos las propiedades con relaciones livianas
      const properties = await this.propertyRepo.find({
        relations: ['agent', 'ratings'], 
    });

    const result = await Promise.all(
        properties.map(async (p) => {
        const { avg } = await this.propertyRepo
        .createQueryBuilder('property')
        .leftJoin('property.ratings', 'rating')
        .select('AVG(rating.score)', 'avg')
        .where('property.id = :id', { id: p.id })
        .getRawOne();

        return {
          ...p,
          ratingAverage: Number(avg) || 0,
        };
      }),
    );
      return result;
    } catch (error) {
      throw new BadRequestException('No se pudieron obtener las propiedades');
    }
  }

  /** ✅ Obtener UNA con promedio de rating */
  async findOne(id: number): Promise<any> {
    const property = await this.propertyRepo.findOne({
      where: { id },
      relations: ['agent', 'comments', 'ratings', 'favorites', 'requests', 'referredBy'],
    });

    if (!property) {
      throw new NotFoundException(`No existe la propiedad con ID ${id}`);
    }

    /** ✅ Calcular el promedio para el detalle */
    const { avg } = await this.propertyRepo
      .createQueryBuilder('property')
      .leftJoin('property.ratings', 'rating')
      .select('AVG(rating.score)', 'avg')
      .where('property.id = :id', { id })
      .getRawOne();

    return {
      ...property,
      ratingAverage: Number(avg) || 0,
    };
  }

  /** ✅ Modificar */
  async update(id: number, updatePropertyDto: UpdatePropertyDto): Promise<Property> {
    const property = await this.findOne(id);

    const updated = Object.assign(property, updatePropertyDto);

    return await this.propertyRepo.save(updated);
  }

  /** ✅ Eliminar */
  async remove(id: number): Promise<{ message: string }> {
    const property = await this.findOne(id);

    await this.propertyRepo.remove(property);

    return { message: `Propiedad con ID ${id} eliminada correctamente` };
  }
}
