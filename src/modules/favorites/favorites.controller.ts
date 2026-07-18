import { Controller, Get, Post, Param, Delete, UseGuards, ParseIntPipe } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { Role } from '../users/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { GetUser } from 'src/common/decorators/get-user.decorator';

// 🔒 SEGURIDAD (C5): el userId se toma SIEMPRE del token (@GetUser), nunca
// de un parámetro de URL — un usuario solo puede operar sobre SUS favoritos.
@UseGuards(JwtAuthGuard)
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  // -----------------------------------------
  // 1) CREAR FAVORITO
  // POST /favorites/:propertyId
  // -----------------------------------------
  @Roles(Role.USER)
  @Post(':propertyId')
  create(
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @GetUser('id') userId: number,
  ) {
    return this.favoritesService.createFavorite({
      user_id: userId,
      property_id: propertyId,
    });
  }

  // -----------------------------------------
  // 2) OBTENER TODOS LOS FAVORITOS DEL USUARIO LOGUEADO
  // GET /favorites
  // -----------------------------------------
  @Roles(Role.USER)
  @Get()
  getAllFavorites(@GetUser('id') userId: number) {
    return this.favoritesService.getAllFavorites(userId);
  }

  // -----------------------------------------
  // 3) ELIMINAR TODOS LOS FAVORITOS DEL USUARIO LOGUEADO
  // DELETE /favorites/all
  // (definida antes que :propertyId para que 'all' no matchee como id)
  // -----------------------------------------
  @Roles(Role.USER)
  @Delete('all')
  deleteAll(@GetUser('id') userId: number) {
    return this.favoritesService.deleteAllFavorites(userId);
  }

  // -----------------------------------------
  // 4) ELIMINAR UN FAVORITO PARTICULAR DEL USUARIO LOGUEADO
  // DELETE /favorites/:propertyId
  // -----------------------------------------
  @Roles(Role.USER)
  @Delete(':propertyId')
  deleteOne(
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @GetUser('id') userId: number,
  ) {
    return this.favoritesService.deleteOneFavorite(userId, propertyId);
  }
}
