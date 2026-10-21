import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Role } from '../users/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';
import { Actor, InteractionActor } from 'src/common/interaction/interaction-actor';
import { CommentRateLimitGuard } from 'src/common/interaction/interaction-rate-limit.guard';

/**
 * Comentarios de una PROPIEDAD (distintos de los de Publicaciones, que viven
 * en `posts.controller.ts` con su propia entidad `PostComment`).
 *
 * Los guards se declaran explícitamente por ruta. Antes este controller usaba
 * `AuthGuard('jwt')` con un `@Roles(Role.USER)` suelto: sin `RolesGuard` ese
 * decorador no protege nada (ver CLAUDE.md), y de hecho aplicarlo habría
 * bloqueado al admin para comentar. Se quitó el decorador decorativo y se dejó
 * la exigencia real: estar logueado.
 */
@Controller('properties/:propertyId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  // -----------------------------------------------------
  // CREAR (cualquiera: logueado o visitante sin sesión)
  // -----------------------------------------------------
  // `OptionalJwtAuthGuard`: si hay sesión válida el comentario queda asociado
  // a la cuenta; sin sesión (o con un token vencido) se guarda como visitante.
  // `CommentRateLimitGuard` va DESPUÉS, para poder contar por usuario o por
  // visitante.
  @UseGuards(OptionalJwtAuthGuard, CommentRateLimitGuard)
  @Post()
  create(
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @Actor() actor: InteractionActor,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(propertyId, actor, dto);
  }

  // -----------------------------------------------------
  // LISTAR (público)
  // -----------------------------------------------------
  // `OptionalJwtAuthGuard` puebla `req.user` si viaja un token válido, pero no
  // rechaza a los anónimos: hace falta para saber si quien mira es admin y
  // mostrarle también los comentarios ocultos.
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findByProperty(
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @GetUser('role') role?: Role,
  ) {
    return this.commentsService.findByProperty(propertyId, role === Role.ADMIN);
  }

  // -----------------------------------------------------
  // EDITAR (solo el autor — lo valida el service)
  // -----------------------------------------------------
  @UseGuards(JwtAuthGuard)
  @Patch(':commentId')
  update(
    @Param('commentId', ParseIntPipe) commentId: number,
    @GetUser('id') userId: number,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.commentsService.update(commentId, userId, dto);
  }

  // -----------------------------------------------------
  // OCULTAR / MOSTRAR (solo admin)
  // -----------------------------------------------------
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':commentId/hide')
  toggleHidden(@Param('commentId', ParseIntPipe) commentId: number) {
    return this.commentsService.toggleHidden(commentId);
  }

  // -----------------------------------------------------
  // ELIMINAR (el autor o un admin — lo valida el service)
  // -----------------------------------------------------
  @UseGuards(JwtAuthGuard)
  @Delete(':commentId')
  remove(
    @Param('commentId', ParseIntPipe) commentId: number,
    @GetUser('id') userId: number,
    @GetUser('role') role: Role,
  ) {
    return this.commentsService.remove(commentId, userId, role === Role.ADMIN);
  }
}
