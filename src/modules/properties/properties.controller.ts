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
  BadRequestException,
} from '@nestjs/common';
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
  @Get('filter')
  filter(@Query() filters: PropertyFilterDto) {
    return this.propertiesService.filter(filters);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(+id);
  }


  // Crear propiedad + imágenes
  @Roles(Role.ADMIN)
  @Post()
  @UseInterceptors(FilesInterceptor('images', 10))
  async create(
    @Body('data') rawData: string,
    @UploadedFiles() images: MulterFile[],
  ) {
    let dto: CreatePropertyDto;
    try {
      dto = JSON.parse(rawData);
    } catch {
      throw new BadRequestException("El campo 'data' debe ser JSON válido");
    }

    return this.propertiesService.createWithImages(dto, images);
  }

  // PATCH: actualizar campos de property, borrar imágenes y subir nuevas (delegado)
  @Roles(Role.ADMIN)
  @Patch(':id')
  @UseInterceptors(FilesInterceptor('newImages', 10))
  async update(
    @Param('id') id: string,
    @Body('data') rawData: string,
    @UploadedFiles() newImages: MulterFile[],
  ) {
    let dto: UpdatePropertyDto;
    try {
      dto = JSON.parse(rawData);
    } catch {
      throw new BadRequestException("El campo 'data' debe ser un JSON válido");
    }

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
}
