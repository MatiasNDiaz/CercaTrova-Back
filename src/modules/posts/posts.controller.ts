import {
  Controller, Get, Post as HttpPost, Patch, Delete,
  Param, Body, Query, UseGuards, UseInterceptors, UploadedFile, ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import {
  CreatePostCommentDto, ReplyPostCommentDto, FindPostsDto,
} from './dto/post-comment.dto';
import { JsonToDtoPipe } from 'src/common/pipes/json-to-dto.pipe';
import { imageUploadOptions } from 'src/common/multer/image-upload.options';
import { Public } from 'src/common/decorators/public.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { Role } from '../users/enums/role.enum';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';

type MulterFile = Express.Multer.File;

/**
 * Publicaciones (feed estilo red social).
 *
 * Los guards van a nivel de clase (`JwtAuthGuard` + `RolesGuard`) y las rutas
 * abiertas se marcan con `@Public()`, igual que en `properties.controller.ts`.
 * Importante: `@Roles(...)` SIN `RolesGuard` no protege nada — por eso los dos
 * guards están siempre presentes.
 */
@Controller('posts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  // ── FEED PÚBLICO ───────────────────────────────────────────────
  // `@Public()` abre la ruta, pero `JwtAuthGuard` cortocircuita sin ejecutar
  // passport, así que `req.user` quedaría vacío incluso para un visitante
  // logueado. `OptionalJwtAuthGuard` se suma al de la clase y sí puebla
  // `req.user` cuando hay token válido — necesario para marcar `likedByMe`
  // sin obligar a iniciar sesión para ver el feed.
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(@Query() query: FindPostsDto, @GetUser('id') viewerId?: number) {
    return this.postsService.findAll(query.sortBy, viewerId);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @GetUser('id') viewerId?: number) {
    return this.postsService.findOne(id, viewerId);
  }

  // ── CREAR / BORRAR (ADMIN) ─────────────────────────────────────
  // El DTO llega como JSON string en el campo `data` y se valida con
  // `JsonToDtoPipe`. Se tipa como `string` A PROPÓSITO: el ValidationPipe
  // global corre antes que los pipes de parámetro y, con el metatype real,
  // intentaría validar el string crudo y devolvería 400 siempre (mismo bugfix
  // documentado en `properties.controller.ts`).
  @Roles(Role.ADMIN)
  @HttpPost()
  @UseInterceptors(FileInterceptor('image', imageUploadOptions))
  create(
    @Body('data', new JsonToDtoPipe(CreatePostDto)) rawDto: string,
    @UploadedFile() image: MulterFile,
    @GetUser('id') agentId: number,
  ) {
    const dto = rawDto as unknown as CreatePostDto;
    return this.postsService.create(dto, image, agentId);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.postsService.remove(id);
  }

  // ── LIKE ───────────────────────────────────────────────────────
  // Sin `@Roles`: alcanza con estar logueado (cualquier rol).
  @HttpPost(':id/like')
  toggleLike(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: number,
  ) {
    return this.postsService.toggleLike(id, userId);
  }

  // ── COMENTARIOS ────────────────────────────────────────────────
  @Public()
  @Get(':id/comments')
  findComments(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('role') role?: Role,
  ) {
    // Los ocultos solo los ve el admin (marcados como tales en la UI).
    return this.postsService.findComments(id, role === Role.ADMIN);
  }

  @HttpPost(':id/comments')
  createComment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePostCommentDto,
    @GetUser('id') userId: number,
  ) {
    return this.postsService.createComment(id, userId, dto.content);
  }

  // Responder está abierto a CUALQUIER usuario logueado (no solo al admin):
  // la conversación funciona como en una red social. Quién responde sale del
  // token, y el frontend distingue visualmente las respuestas del admin.
  @HttpPost('comments/:commentId/reply')
  replyComment(
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body() dto: ReplyPostCommentDto,
    @GetUser('id') userId: number,
  ) {
    return this.postsService.replyComment(commentId, userId, dto.content);
  }

  @Roles(Role.ADMIN)
  @Patch('comments/:commentId/hide')
  toggleHideComment(@Param('commentId', ParseIntPipe) commentId: number) {
    return this.postsService.toggleHideComment(commentId);
  }

  @Roles(Role.ADMIN)
  @Delete('comments/:commentId')
  removeComment(@Param('commentId', ParseIntPipe) commentId: number) {
    return this.postsService.removeComment(commentId);
  }
}
