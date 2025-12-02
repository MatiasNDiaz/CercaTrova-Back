// src/modules/ImagesProperty/propertyImages.controller.ts
import { Controller, Get, Param, Patch, Delete, ParseIntPipe } from '@nestjs/common';
import { PropertyImagesService } from './propertyImages.service';
import { Role } from '../users/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('property-images')
export class PropertyImagesController {
  constructor(private readonly imagesService: PropertyImagesService) {}

  
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
