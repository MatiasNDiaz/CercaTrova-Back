// src/modules/properties/properties.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { JsonToDtoPipe } from 'src/common/pipes/json-to-dto.pipe';
import { imageUploadOptions } from 'src/common/multer/image-upload.options';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '../users/enums/role.enum';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PropertyFilterDto } from './dto/property-filter.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
type MulterFile = Express.Multer.File;

@Controller('properties')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Public()
  @Get()
  findAll() {
    return this.propertiesService.findAll();

  }

  @Public()
  @Get('filter') // Asegurate de que NO haya un @Get(':id') arriba de este que pueda atrapar la palabra "filter"
  async filter(@Query() filters: PropertyFilterDto) {
  console.log('Filtros recibidos:', filters); // Agregá este log para debuguear
  return this.propertiesService.filter(filters);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(+id);
  }


  // Crear propiedad + imágenes
  // 🔒 SEGURIDAD (M4): el campo 'data' pasa por JsonToDtoPipe — el DTO se
  // valida con class-validator en vez del JSON.parse() manual sin control
  @Roles(Role.ADMIN)
  @Post()
  @UseInterceptors(FilesInterceptor('images', 10, imageUploadOptions))
  async create(
    @Body('data', new JsonToDtoPipe(CreatePropertyDto)) dto: CreatePropertyDto,
    @UploadedFiles() images: MulterFile[],
  ) {
    return this.propertiesService.createWithImages(dto, images);
  }

  // PATCH: actualizar campos de property, borrar imágenes y subir nuevas (delegado)
  @Roles(Role.ADMIN)
  @Patch(':id')
  @UseInterceptors(FilesInterceptor('newImages', 10, imageUploadOptions))
  async update(
    @Param('id') id: string,
    @Body('data', new JsonToDtoPipe(UpdatePropertyDto)) dto: UpdatePropertyDto,
    @UploadedFiles() newImages: MulterFile[],
  ) {
    return this.propertiesService.update(
      +id,
      dto,
      newImages,
      dto.deleteImages ?? [],
    );
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.propertiesService.remove(+id);
  }

  // Si querés mantener endpoint aquí (opcional) delega al service de images
  @Roles(Role.ADMIN)
  @Delete('image/:id')
  async deleteImage(@Param('id') id: number) {
    return this.propertiesService.deleteImage(id);
  }

  // Traer la Localidad, Barrio y Zona para incluir los valores reales en los Selects de los filtros
  @Public()
  @Get('filters/locations')
  getLocationFilters() {
  return this.propertiesService.getLocationFilters();
  }

}
