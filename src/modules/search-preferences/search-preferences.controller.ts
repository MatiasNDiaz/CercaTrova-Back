import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { SearchPreferencesService } from './search-preferences.service';
import { CreateSearchPreferenceDto } from './dto/create-search-preference.dto';
import { UpdateSearchPreferenceDto } from './dto/update-search-preference.dto';

@Controller('search-preferences')
export class SearchPreferencesController {
  constructor(private readonly searchPreferencesService: SearchPreferencesService) {}

  @Post()
  create(@Body() createSearchPreferenceDto: CreateSearchPreferenceDto) {
    return this.searchPreferencesService.create(createSearchPreferenceDto);
  }

  @Get()
  findAll() {
    return this.searchPreferencesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.searchPreferencesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSearchPreferenceDto: UpdateSearchPreferenceDto) {
    return this.searchPreferencesService.update(+id, updateSearchPreferenceDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.searchPreferencesService.remove(+id);
  }
}
