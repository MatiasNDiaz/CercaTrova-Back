import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertyType } from './entities/typeOfProperty.entity';
import { Property } from '../properties/entities/property.entity';
import { CreateTypeOfPropertyDto } from './dto/create-type-of-property.dto';
import { UpdateTypeOfPropertyDto } from './dto/update-type-of-property.dto';

@Injectable()
export class TypeOfPropertyService {
  constructor(
    @InjectRepository(PropertyType)
    private readonly typeRepo: Repository<PropertyType>,

    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
  ) {}

  async create(dto: CreateTypeOfPropertyDto) {
    const exists = await this.typeRepo.findOne({ where: { name: dto.name } });

    if (exists) {
      throw new ConflictException('Ese tipo de propiedad ya existe.');
    }

    const type = this.typeRepo.create(dto);
    return this.typeRepo.save(type);
  }

  findAll() {
    return this.typeRepo.find();
  }

  async findOne(id: number) {
    const type = await this.typeRepo.findOne({ where: { id } });

    if (!type) throw new NotFoundException('Tipo de propiedad no encontrado.');

    return type;
  }

  async update(id: number, dto: UpdateTypeOfPropertyDto) {
    const type = await this.findOne(id);

    return this.typeRepo.save({ ...type, ...dto });
  }

  async remove(id: number) {
    // 404 si el tipo no existe
    await this.findOne(id);

    // (ERROR_FIXES): un tipo referenciado por properties no puede borrarse —
    // antes la violación de FK salía como 500 crudo
    const inUse = await this.propertyRepo.count({
      where: { typeOfProperty: { id } },
    });
    if (inUse > 0) {
      throw new ConflictException(
        'No se puede eliminar: hay propiedades usando este tipo',
      );
    }

    await this.typeRepo.delete(id);
    return { message: 'Tipo de propiedad eliminado' };
  }
}
