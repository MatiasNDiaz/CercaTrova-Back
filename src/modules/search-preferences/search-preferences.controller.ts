import { Controller, Post, Patch, Get, Body, Param } from '@nestjs/common';
import { SearchPreferencesService } from './search-preferences.service';
import { CreateSearchPreferenceDto } from './dto/create-search-preference.dto';
import { UpdateSearchPreferenceDto } from './dto/update-search-preference.dto';

@Controller('search-preferences')
export class SearchPreferencesController {
  constructor(private readonly service: SearchPreferencesService) {}

  @Post(':userId')
  create(@Param('userId') userId: number, @Body() dto: CreateSearchPreferenceDto) {
    return this.service.create(userId, dto);
  }

  @Patch(':userId')
  update(@Param('userId') userId: number, @Body() dto: UpdateSearchPreferenceDto) {
    return this.service.update(userId, dto);
  }

  @Get(':userId')
  getByUser(@Param('userId') userId: number) {
    return this.service.getByUser(userId);
  }
}
