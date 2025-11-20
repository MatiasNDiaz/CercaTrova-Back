import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertyType } from './entities/typeOfProperty.entity'; 
import { CreateTypeOfPropertyDto } from './dto/create-type-of-property.dto';
import { UpdateTypeOfPropertyDto } from './dto/update-type-of-property.dto';

@Injectable()
export class TypeOfPropertyService {
  constructor(
    @InjectRepository(PropertyType)
    private readonly typeRepo: Repository<PropertyType>,
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
    const result = await this.typeRepo.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException('Tipo de propiedad no encontrado.');
    }

    return { message: 'Tipo de propiedad eliminado' };
  }
}
