import { Controller, Post, Patch, Get, Body, UseGuards, Req, Param } from '@nestjs/common';
import { SearchPreferencesService } from './search-preferences.service';
import { CreateSearchPreferenceDto } from './dto/create-search-preference.dto';
import { UpdateSearchPreferenceDto } from './dto/update-search-preference.dto';
import { Role } from '../users/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';

// 🔒 Dos correcciones respecto de la versión anterior:
//  1. `AuthGuard('jwt')` → `JwtAuthGuard`, que es el guard del proyecto (el
//     único que respeta `@Public()`); usar el de passport directo rompía la
//     convención y no habría respetado un `@Public()` futuro.
//  2. `RolesGuard` sube a nivel de clase: sin él, el `@Roles(Role.USER)` del
//     POST era decorativo (verificado: un ADMIN podía crear preferencias).
//     La ruta admin de abajo ya no necesita repetir su propio @UseGuards.
@UseGuards(JwtAuthGuard, RolesGuard)
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
  // cualquier logueado leía las preferencias (datos personales) de otros.
  // El RolesGuard ahora viene del nivel de clase.
  @Roles(Role.ADMIN)
  @Get('user/:id')
  getByUserId(@Param('id') id: string) {
    return this.service.getByUser(Number(id));
  }
}
