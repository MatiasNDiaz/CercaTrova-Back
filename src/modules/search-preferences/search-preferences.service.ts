import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchPreference } from './entities/search-preference.entity';
import { CreateSearchPreferenceDto } from './dto/create-search-preference.dto';
import { UpdateSearchPreferenceDto } from './dto/update-search-preference.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class SearchPreferencesService {
  constructor(
    @InjectRepository(SearchPreference)
    private repo: Repository<SearchPreference>,
    private usersService: UsersService
  ) {}

  async getByUser(userId: number) {
    return this.repo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });
  }

  async create(userId: number, dto: CreateSearchPreferenceDto) {
    const user = await this.usersService.getUserById(userId);
    if (!user) throw new Error('Usuario no encontrado');

    const pref = this.repo.create({ ...dto, user });
    return this.repo.save(pref);
  }

  async update(userId: number, dto: UpdateSearchPreferenceDto) {
    let pref = await this.getByUser(userId);

    if (!pref) return this.create(userId, dto);

    Object.assign(pref, dto);
    return this.repo.save(pref);
  }

  async findAllWithUsers() {
    return this.repo.find({ relations: ['user'] });
  }
}
