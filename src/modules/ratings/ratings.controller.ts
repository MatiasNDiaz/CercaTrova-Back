import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe, Req } from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { Role } from '../users/enums/role.enum';

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  // 🔒 Sin RolesGuard el @Roles(Role.USER) era decorativo y un ADMIN podía
  // valorar propiedades (verificado en la auditoría). Valorar es una acción de
  // usuario: el admin es quien publica, no quien puntúa.
  // El id sale del token vía @GetUser, no de @Req() — convención del repo.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  @Post(':propertyId')
  async rate(
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @Body() dto: CreateRatingDto,
    @GetUser('id') userId: number,
  ) {
    return this.ratingsService.rateProperty(userId, propertyId, dto.score);
  }

  /**
   * Valoraciones del usuario logueado ("Propiedades que valoré").
   *
   * ⚠️ Va ANTES de `@Get(':propertyId')`: si estuviera después, la ruta
   * `/ratings/mine` se comería el patrón `:propertyId` y `ParseIntPipe`
   * respondería 400 con "mine".
   */
  @UseGuards(JwtAuthGuard)
  @Get('mine')
  async getMine(@GetUser('id') userId: number) {
    return this.ratingsService.getByUser(userId);
  }

  @Get(':propertyId')
  async getByProperty(
  @Param('propertyId', ParseIntPipe) propertyId: number,
  ) {
  return this.ratingsService.getByProperty(propertyId);
}
}
