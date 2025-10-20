import { Injectable } from '@nestjs/common';
import { CreateSearchPreferenceDto } from './dto/create-search-preference.dto';
import { UpdateSearchPreferenceDto } from './dto/update-search-preference.dto';

@Injectable()
export class SearchPreferencesService {
  create(createSearchPreferenceDto: CreateSearchPreferenceDto) {
    return 'This action adds a new searchPreference';
  }

  findAll() {
    return `This action returns all searchPreferences`;
  }

  findOne(id: number) {
    return `This action returns a #${id} searchPreference`;
  }

  update(id: number, updateSearchPreferenceDto: UpdateSearchPreferenceDto) {
    return `This action updates a #${id} searchPreference`;
  }

  remove(id: number) {
    return `This action removes a #${id} searchPreference`;
  }
}
