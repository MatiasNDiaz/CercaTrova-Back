import { Controller, Get, Post, Body, Param, Delete, Req, UseGuards } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { Role } from '../users/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  // -----------------------------------------
  // 1) CREAR FAVORITO
  // POST /favorites
  // -----------------------------------------
@Roles(Role.USER)
@UseGuards(JwtAuthGuard)
@Post(':propertyId')
create(
  @Param('propertyId') propertyId: number,
  @Req() req
) {
  const userId = req.user.id;
  return this.favoritesService.createFavorite({ 
    user_id: userId, 
    property_id: propertyId 
  });
}

  // -----------------------------------------
  // 2) OBTENER TODOS LOS FAVORITOS DE UN USUARIO
  // GET /favorites/:userId
  // -----------------------------------------
  @Roles(Role.USER)
  @UseGuards(JwtAuthGuard)
  @Get(':userId')
  getAllFavorites(@Param('userId') userId: string) {
    return this.favoritesService.getAllFavorites(+userId);
  }

  // -----------------------------------------
  // 3) ELIMINAR UN FAVORITO PARTICULAR
  // DELETE /favorites/:userId/:propertyId
  // -----------------------------------------
  @Roles(Role.USER)
  @UseGuards(JwtAuthGuard)
  @Delete(':userId/:propertyId')
  deleteOne(
    @Param('userId') userId: string,
    @Param('propertyId') propertyId: string,
  ) {
    return this.favoritesService.deleteOneFavorite(+userId, +propertyId);
  }

  // -----------------------------------------
  // 4) ELIMINAR TODOS LOS FAVORITOS DE UN USUARIO
  // DELETE /favorites/all/:userId
  // -----------------------------------------
  @Roles(Role.USER)
  @UseGuards(JwtAuthGuard)
  @Delete('all/:userId')
  deleteAll(@Param('userId') userId: string) {
    return this.favoritesService.deleteAllFavorites(+userId);
  }
}
