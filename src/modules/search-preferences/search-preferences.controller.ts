import { Controller, Post, Patch, Get, Body, UseGuards, Req } from '@nestjs/common';
import { SearchPreferencesService } from './search-preferences.service';
import { CreateSearchPreferenceDto } from './dto/create-search-preference.dto';
import { UpdateSearchPreferenceDto } from './dto/update-search-preference.dto';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '../users/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';

@UseGuards(AuthGuard('jwt'))
@Controller('search-preferences')
export class SearchPreferencesController {
  constructor(private readonly service: SearchPreferencesService) {}

  @Roles(Role.USER)
  @Post()
  create(@Req() req, @Body() dto: CreateSearchPreferenceDto) {
    const userId = req.user.id;
    return this.service.create(userId, dto);
  }

  @Patch()
  update(@Req() req, @Body() dto: UpdateSearchPreferenceDto) {
    const userId = req.user.id;
    return this.service.update(userId, dto);
  }

  @Get()
  getByUser(@Req() req) {
    const userId = req.user.id;
    return this.service.getByUser(userId);
  }
}
