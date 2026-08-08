// src/modules/ImagesProperty/propertyImages.controller.ts
import { Body, Controller, Get, Param, Patch, Delete, ParseIntPipe, UseGuards } from '@nestjs/common';
import { PropertyImagesService } from './propertyImages.service';
import { ReorderImagesDto } from './Dto/ReorderImagesDto';
import { Role } from '../users/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';

// 🔒 SEGURIDAD (C4): sin estos guards, los @Roles de abajo eran decorativos
// y DELETE/set-cover quedaban públicos (borrado irreversible en Cloudinary)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('property-images')
export class PropertyImagesController {
  constructor(private readonly imagesService: PropertyImagesService) {}

  /**
   * Reordena la galería completa de una propiedad.
   *
   * ⚠️ El `:propertyId` de esta ruta es el id de la PROPIEDAD, no el de una
   * imagen — a diferencia del resto del controller, donde `:id` siempre es una
   * imagen. Se eligió así porque la operación es sobre el conjunto: mandar N
   * PATCH sueltos (uno por imagen) dejaría la galería en un estado intermedio
   * inconsistente si alguno fallara a mitad de camino.
   *
   * Sobre el orden de declaración (la trampa recurrente de este repo): acá NO
   * hay colisión posible — el segundo segmento es un literal distinto
   * (`reorder` vs `set-cover`) y `@Get(':id')` es otro método HTTP. Va primera
   * por convención de legibilidad, no por necesidad del router.
   */
  @Roles(Role.ADMIN)
  @Patch(':propertyId/reorder')
  reorder(
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @Body() dto: ReorderImagesDto,
  ) {
    return this.imagesService.reorder(propertyId, dto.imageIds);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.imagesService.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/set-cover')
  setAsCover(@Param('id', ParseIntPipe) id: number) {
    return this.imagesService.setAsCover(id);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  deleteImage(@Param('id', ParseIntPipe) id: number) {
    return this.imagesService.deleteImage(id);
  }
}
