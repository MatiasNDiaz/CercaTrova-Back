import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe, Req } from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { Role } from '../users/enums/role.enum';

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @UseGuards(JwtAuthGuard)
  @Roles(Role.USER)
  @Post(':propertyId')
  async rate(
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @Body() dto: CreateRatingDto,
    @Req() req
  ) {
    const userId = req.user.id;
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
