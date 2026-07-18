import { Controller, Post, Patch, Get, Body, UseGuards, Req, Param } from '@nestjs/common';
import { SearchPreferencesService } from './search-preferences.service';
import { CreateSearchPreferenceDto } from './dto/create-search-preference.dto';
import { UpdateSearchPreferenceDto } from './dto/update-search-preference.dto';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '../users/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';

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

  // 🔒 SEGURIDAD (C6): sin RolesGuard, el @Roles(ADMIN) era decorativo y
  // cualquier logueado leía las preferencias (datos personales) de otros
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  @Get('user/:id')
  getByUserId(@Param('id') id: string) {
    return this.service.getByUser(Number(id));
  }
}
