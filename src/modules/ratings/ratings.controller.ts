import { Controller, Get, Post, Body, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { Actor, InteractionActor } from 'src/common/interaction/interaction-actor';
import { ReactionRateLimitGuard } from 'src/common/interaction/interaction-rate-limit.guard';

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  /**
   * Calificar con estrellas — usuario logueado o visitante sin sesión.
   *
   * `OptionalJwtAuthGuard`: con sesión válida la calificación queda en su
   * cuenta; sin sesión (o token vencido) se guarda como visitante, identificado
   * por la cookie anónima `ct_vid`. El admin sigue sin poder calificar (lo
   * rechaza el service con 403).
   */
  @UseGuards(OptionalJwtAuthGuard, ReactionRateLimitGuard)
  @Post(':propertyId')
  async rate(
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @Body() dto: CreateRatingDto,
    @Actor() actor: InteractionActor,
  ) {
    return this.ratingsService.rateProperty(actor, propertyId, dto.score);
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

  /** La calificación que le puso a esta propiedad quien mira (cuenta o cookie). */
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':propertyId/mine')
  async getMyRating(
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @Actor() actor: InteractionActor,
  ) {
    return this.ratingsService.getMine(actor, propertyId);
  }

  @Get(':propertyId')
  async getByProperty(
    @Param('propertyId', ParseIntPipe) propertyId: number,
  ) {
    return this.ratingsService.getByProperty(propertyId);
  }
}
