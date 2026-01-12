import { Controller, Post, Get, Body, Param, Patch, Delete, UseGuards, ParseIntPipe } from '@nestjs/common';
import { PropertyRequestService } from './propertyRequest.service';
import { CreateRequestPropertyDto } from './dto/createRequestPropertyDto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'; 
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { GetUser } from 'src/common/decorators/get-user.decorator'; // Asegurá esta ruta
import { Role } from '../users/enums/role.enum';
import { RequestStatus } from './entities/PropertyRequest';

@Controller('property-requests')
@UseGuards(JwtAuthGuard) // Bloqueo base: nadie entra si no está logueado
export class PropertyRequestController {
  constructor(private readonly service: PropertyRequestService) {}

  /**
   * 1. EL USUARIO envía su propuesta de propiedad.
   * El userId se extrae automáticamente del token JWT por seguridad.
   */
  @Post()
  create(@Body() dto: CreateRequestPropertyDto, @GetUser('id') userId: number) {
    return this.service.create(dto, userId);
  }

  /**
   * 2. EL USUARIO consulta el estado de sus propias solicitudes.
   * Nota: Esta ruta debe ir ANTES de ':id' para que Nest no se confunda.
   */
  @Get('my-requests')
  findMyRequests(@GetUser('id') userId: number) {
    return this.service.findByUser(userId);
  }

  /**
   * 3. EL AGENTE lista todas las solicitudes pendientes de la web.
   */
  @Get()
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  findAll() {
    return this.service.findAll();
  }

  /**
   * 4. EL AGENTE ve el detalle profundo de una solicitud (incluye datos del dueño).
   */
  @Get(':id')
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  /**
   * 5. EL AGENTE cambia el estado (Aceptar/Rechazar).
   * Aquí es donde luego dispararemos la creación de la propiedad real.
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
   * 6. EL AGENTE elimina una solicitud (por descarte o limpieza).
   */
  @Delete(':id')
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}