import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchPreference } from './entities/search-preference.entity';
import { CreateSearchPreferenceDto } from './dto/create-search-preference.dto';
import { UpdateSearchPreferenceDto } from './dto/update-search-preference.dto';
import { UsersService } from '../users/users.service';
import { PropertyType } from '../typeOfProperty/entities/typeOfProperty.entity';

@Injectable()
export class SearchPreferencesService {
  constructor(
    @InjectRepository(SearchPreference)
    private repo: Repository<SearchPreference>,

    @InjectRepository(PropertyType)
    private propertyTypeRepo: Repository<PropertyType>,

    private usersService: UsersService
  ) {}

  async getByUser(userId: number) {
    return this.repo.findOne({
      where: { user: { id: userId } },
      relations: ['user', 'typeOfProperty'],
    });
  }

  async create(userId: number, dto: CreateSearchPreferenceDto) {
    // (B2): excepción HTTP real en vez de Error genérico (evita 500)
    const user = await this.usersService.getUserById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    // Aplicar trim a los campos de texto
  if (dto.localidad) dto.localidad = dto.localidad.trim();
  if (dto.barrio) dto.barrio = dto.barrio.trim();
  if (dto.zone) dto.zone = dto.zone.trim();

    const pref = this.repo.create({ ...dto, user });

    // 🔹 Asignar la entidad PropertyType si envían typeOfPropertyId
    if (dto.typeOfPropertyId) {
      const type = await this.propertyTypeRepo.findOne({
        where: { id: dto.typeOfPropertyId }
      });
      if (!type) throw new NotFoundException(
        `No existe el tipo de propiedad con ID ${dto.typeOfPropertyId}`
      );
      pref.typeOfProperty = type;
    }

    const savedPref = await this.repo.save(pref);

    // 🔹 Recargar con la relación para que aparezca en JSON y email
    return this.repo.findOne({
      where: { id: savedPref.id },
      relations: ['typeOfProperty', 'user']
    });
  }

  async update(userId: number, dto: UpdateSearchPreferenceDto) {
    let pref = await this.getByUser(userId);

    if (!pref) return this.create(userId, dto);

    Object.assign(pref, dto);

    // 🔹 Actualizar typeOfProperty si envían typeOfPropertyId
    if (dto.typeOfPropertyId) {
      const type = await this.propertyTypeRepo.findOne({
        where: { id: dto.typeOfPropertyId }
      });
      if (!type) throw new NotFoundException(
        `No existe el tipo de propiedad con ID ${dto.typeOfPropertyId}`
      );
      pref.typeOfProperty = type;
    }

    const savedPref = await this.repo.save(pref);

    return this.repo.findOne({
      where: { id: savedPref.id },
      relations: ['typeOfProperty', 'user']
    });
  }

  async findAllWithUsers() {
    return this.repo.find({ relations: ['user', 'typeOfProperty'] });
  }
}
