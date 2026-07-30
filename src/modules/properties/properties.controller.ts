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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { JsonToDtoPipe } from 'src/common/pipes/json-to-dto.pipe';
import { imageUploadOptions } from 'src/common/multer/image-upload.options';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { Role } from '../users/enums/role.enum';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';
import { TrackingService } from '../tracking/tracking.service';
import { getVisitorId } from '../tracking/visitor-id.middleware';
import { PropertyFilterDto } from './dto/property-filter.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
type MulterFile = Express.Multer.File;

@Controller('properties')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly trackingService: TrackingService,
  ) {}

  @Public()
  @Get()
  findAll() {
    return this.propertiesService.findAll();

  }

  // `OptionalJwtAuthGuard` no exige sesión, pero puebla `req.user` cuando la
  // hay: hace falta para poder EXCLUIR al admin de las métricas sin cerrarle
  // la ruta a los visitantes anónimos.
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('filter') // Asegurate de que NO haya un @Get(':id') arriba de este que pueda atrapar la palabra "filter"
  async filter(
    @Query() filters: PropertyFilterDto,
    @Req() req: Request,
    @GetUser('id') userId?: number,
    @GetUser('role') role?: Role,
  ) {
    // Telemetría de búsquedas (Fase 0). Fire-and-forget: registrar una métrica
    // nunca puede demorar ni romper la búsqueda del usuario.
    void this.trackingService.recordFilterUsage(filters, getVisitorId(req), userId, role);
    return this.propertiesService.filter(filters);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: Request,
    @GetUser('id') userId?: number,
    @GetUser('role') role?: Role,
  ) {
    // Idem: alimenta el ranking de "propiedades más visitadas". El service
    // descarta las vistas del admin.
    void this.trackingService.recordPropertyView({
      propertyId: +id,
      visitorId: getVisitorId(req),
      userId,
      role,
    });
    return this.propertiesService.findOne(+id);
  }


  // Crear propiedad + imágenes
  // 🔒 SEGURIDAD (M4): el campo 'data' pasa por JsonToDtoPipe — el DTO se
  // valida con class-validator en vez del JSON.parse() manual sin control
  //
  // ⚠️ BUGFIX (multipart 400): el parámetro se tipa como `string` A PROPÓSITO.
  // El ValidationPipe GLOBAL (main.ts, transform:true) corre ANTES que los pipes
  // de parámetro. Si el metatype es `CreatePropertyDto`, el pipe global intenta
  // validar el STRING crudo del campo multipart 'data' como si ya fuera el DTO
  // (plainToInstance sobre un string → instancia vacía) y devuelve
  // "title should not be empty · description should not be empty · …" para TODOS
  // los campos, aunque el JSON venga completo — y JsonToDtoPipe nunca llegaba a
  // parsear. Al declarar el metatype como primitivo (`string`), el pipe global
  // lo ignora (toValidate() saltea String/Number/Boolean/Array/Object) y
  // JsonToDtoPipe queda como ÚNICO validador: parsea el JSON y valida con las
  // mismas reglas (whitelist + forbidNonWhitelisted). Devuelve una instancia
  // real de CreatePropertyDto en runtime; el cast solo alinea el tipo estático.
  @Roles(Role.ADMIN)
  @Post()
  @UseInterceptors(FilesInterceptor('images', 10, imageUploadOptions))
  async create(
    @Body('data', new JsonToDtoPipe(CreatePropertyDto)) rawDto: string,
    @UploadedFiles() images: MulterFile[],
    // (ERROR_FIXES R-27): el agente sale del token del admin que crea
    @GetUser('id') agentId: number,
  ) {
    const dto = rawDto as unknown as CreatePropertyDto;
    return this.propertiesService.createWithImages(dto, images, agentId);
  }

  // PATCH: actualizar campos de property, borrar imágenes y subir nuevas (delegado)
  @Roles(Role.ADMIN)
  @Patch(':id')
  @UseInterceptors(FilesInterceptor('newImages', 10, imageUploadOptions))
  async update(
    @Param('id') id: string,
    // Mismo bugfix que en create(): `string` para que el ValidationPipe global no
    // pise el campo 'data'; JsonToDtoPipe parsea+valida y devuelve el DTO real.
    @Body('data', new JsonToDtoPipe(UpdatePropertyDto)) rawDto: string,
    @UploadedFiles() newImages: MulterFile[],
  ) {
    const dto = rawDto as unknown as UpdatePropertyDto;
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
