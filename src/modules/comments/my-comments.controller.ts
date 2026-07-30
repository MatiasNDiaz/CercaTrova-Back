import { Controller, Get, UseGuards } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

/**
 * Comentarios del usuario logueado, en todas las propiedades.
 *
 * Vive en su propio controller porque `CommentsController` está anidado bajo
 * `properties/:propertyId/comments` y esta consulta cruza todas las propiedades.
 *
 * El id del usuario SIEMPRE sale del token (`@GetUser('id')`), nunca de un
 * parámetro de la URL — un `:userId` en la ruta sería un IDOR.
 */
@Controller('my-comments')
@UseGuards(JwtAuthGuard)
export class MyCommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  findMine(@GetUser('id') userId: number) {
    return this.commentsService.findByUser(userId);
  }
}
