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
  BadRequestException
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

@Controller('properties')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  // 🟢 Obtener todas las Propiedades
  @Public()
  @Get()
  findAll() {
    return this.propertiesService.findAll();
  }
  
  // 🟢 Obtener una propiedad
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(+id);
  }

  // 🟢 Obetener propiedades a travez de filtros
  @Public()
  @Get('filter')
  filter(@Query() filters: PropertyFilterDto) {
    return this.propertiesService.filter(filters);
  }

  // 🟢 Crear una propiedad con sus imagenes
  @Roles(Role.ADMIN)
  @Post()
@UseInterceptors(
  FilesInterceptor("images", 10) // "images" debe coincidir con los nombres enviados desde frontend
)
async create(
  @Body("data") rawData: string,       // ⬅️ viene como string
  @UploadedFiles() images: Express.Multer.File[],
) {
  let dto: CreatePropertyDto;

  try {
    dto = JSON.parse(rawData);  // ⬅️ convierte el string a JSON
  } catch (e) {
    throw new BadRequestException("El campo 'data' debe ser JSON válido");
  }

  return this.propertiesService.createWithImages(dto, images);
}

  // 🟠 Actualizar Propiedades 
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePropertyDto) {
    return this.propertiesService.update(+id, dto);
  }

  // 🔴 Eliminar propiedades 
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.propertiesService.remove(+id);
  }

  // 🔴 Eliminar las imagenes de una propiedad
  @Roles(Role.ADMIN)
  @Delete('image/:id')
  async deleteImage(
    @Param('id') id: number,
  ) {
    return this.propertiesService.deleteImage(id);
  }

}
