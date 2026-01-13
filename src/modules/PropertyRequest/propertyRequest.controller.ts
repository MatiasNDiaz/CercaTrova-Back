// src/modules/PropertyRequest/propertyRequest.controller.ts

import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Param, 
  Patch, 
  Delete, 
  UseGuards, 
  ParseIntPipe 
} from '@nestjs/common';
import { PropertyRequestService } from './propertyRequest.service';
import { CreateRequestPropertyDto } from './dto/createRequestPropertyDto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'; 
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { Role } from '../users/enums/role.enum';
import { RequestStatus } from './entities/PropertyRequest';

@Controller('property-requests')
@UseGuards(JwtAuthGuard) // Protección global para este controlador
export class PropertyRequestController {
  constructor(private readonly service: PropertyRequestService) {}

  /**
   * 1. EL USUARIO envía su propuesta de propiedad.
   */
  @Post()
  create(@Body() dto: CreateRequestPropertyDto, @GetUser('id') userId: number) {
    return this.service.create(dto, userId);
  }

  /**
   * 2. EL USUARIO consulta sus propias solicitudes.
   */
  @Get('my-requests')
  findMyRequests(@GetUser('id') userId: number) {
    return this.service.findByUser(userId);
  }

  /**
   * 3. EL AGENTE lista todas las solicitudes de la web.
   */
  @Get()
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  findAll() {
    return this.service.findAll();
  }

  /**
   * 4. EL AGENTE ve todas las solicitudes de UN usuario específico.
   * Útil para ver si un dueño tiene varias propiedades para tasar.
   */
  @Get('user/:userId')
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  findByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.service.findByUser(userId);
  }

  /**
   * 5. EL AGENTE ve el detalle profundo de una solicitud específica.
   */
  @Get(':id')
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  /**
   * 6. EL AGENTE cambia el estado (Revision, Contactado, Tasando, etc.).
   */
  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: RequestStatus, 
  ) {
    return this.service.updateStatus(id, status);
  }

  /**
   * 7. EL AGENTE elimina una solicitud.
   */
  @Delete(':id')
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  // src/modules/PropertyRequest/propertyRequest.controller.ts

   /**
   * 8. EL USUARIO consulta una solicitud específica de su propia lista.
   */
@Get('my-requests/:id')
@UseGuards(JwtAuthGuard) // Aseguramos que haya un token válido
findMyOne(
  @Param('id', ParseIntPipe) id: number,
  @GetUser('id') userId: number // ID extraído del Token
) {
  // Pasamos ambos IDs para la verificación cruzada
  return this.service.findMyOne(id, userId);
}
}