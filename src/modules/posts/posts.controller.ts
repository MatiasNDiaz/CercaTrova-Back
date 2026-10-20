import {
  Controller, Get, Post as HttpPost, Patch, Delete,
  Param, Body, Query, UseGuards, UseInterceptors, UploadedFiles, ParseIntPipe,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { PostsService } from './posts.service';
import { CreatePostDto, UpdatePostDto } from './dto/create-post.dto';
import { POST_MEDIA_LIMITS } from './post-media.constants';
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
 * Campos de archivo aceptados. `images` es el nuevo (varias imágenes); `image`
 * (una sola) se sigue aceptando para no romper a un cliente con el formulario
 * anterior. Los dos pasan por `imageUploadOptions` (solo image/*, ≤5 MB).
 * Los VIDEOS no viajan acá: se suben directo a Cloudinary (ver
 * `getVideoUploadSignature`).
 */
const POST_IMAGE_FIELDS = [
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: POST_MEDIA_LIMITS.maxMediaPerPost },
];

type PostImageFiles = { image?: MulterFile[]; images?: MulterFile[] };

/** Une los dos campos en una sola lista, en el orden en que llegaron. */
const imageList = (files?: PostImageFiles): MulterFile[] => [
  ...(files?.image ?? []),
  ...(files?.images ?? []),
];

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

  /**
   * Última publicación con video (para "Cerca-Reels" de la landing).
   * ⚠️ Va ANTES de `GET :id`: Nest registra las rutas en orden y `:id`
   * atraparía "latest-video" (y respondería 400 por el `ParseIntPipe`).
   */
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('latest-video')
  findLatestWithVideo() {
    return this.postsService.findLatestWithVideo();
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @GetUser('id') viewerId?: number) {
    return this.postsService.findOne(id, viewerId);
  }

  // ── SUBIDA DE VIDEOS (ADMIN) ───────────────────────────────────
  // Firma para que el navegador suba un video directo a Cloudinary. Solo
  // admin: con una firma válida cualquiera podría subir a la cuenta.
  @Roles(Role.ADMIN)
  @HttpPost('media/video-signature')
  getVideoUploadSignature() {
    return this.postsService.getVideoUploadSignature();
  }

  // ── CREAR / EDITAR / BORRAR (ADMIN) ────────────────────────────
  // El DTO llega como JSON string en el campo `data` y se valida con
  // `JsonToDtoPipe`. Se tipa como `string` A PROPÓSITO: el ValidationPipe
  // global corre antes que los pipes de parámetro y, con el metatype real,
  // intentaría validar el string crudo y devolvería 400 siempre (mismo bugfix
  // documentado en `properties.controller.ts`).
  @Roles(Role.ADMIN)
  @HttpPost()
  @UseInterceptors(FileFieldsInterceptor(POST_IMAGE_FIELDS, imageUploadOptions))
  create(
    @Body('data', new JsonToDtoPipe(CreatePostDto)) rawDto: string,
    @UploadedFiles() files: PostImageFiles,
    @GetUser('id') agentId: number,
  ) {
    const dto = rawDto as unknown as CreatePostDto;
    return this.postsService.create(dto, imageList(files), agentId);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  @UseInterceptors(FileFieldsInterceptor(POST_IMAGE_FIELDS, imageUploadOptions))
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body('data', new JsonToDtoPipe(UpdatePostDto)) rawDto: string,
    @UploadedFiles() files: PostImageFiles,
  ) {
    const dto = rawDto as unknown as UpdatePostDto;
    return this.postsService.update(id, dto, imageList(files));
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
  // `OptionalJwtAuthGuard` es OBLIGATORIO acá, no decorativo: sin él,
  // `JwtAuthGuard` cortocircuita por el `@Public()` sin ejecutar passport y
  // `req.user` queda vacío INCLUSO para el admin logueado — con lo cual
  // `role === Role.ADMIN` era siempre false y el admin no podía ver (ni por
  // lo tanto revertir) los comentarios que él mismo había ocultado.
  // Mismo patrón que `GET /posts` y `GET /posts/:id` de más arriba.
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
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
