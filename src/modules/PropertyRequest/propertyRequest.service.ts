// src/modules/PropertyRequest/propertyRequest.service.ts

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertyRequest, RequestStatus } from './entities/PropertyRequest';
import { CreateRequestPropertyDto } from './dto/createRequestPropertyDto';

@Injectable()
export class PropertyRequestService {
  constructor(
    @InjectRepository(PropertyRequest)
    private readonly requestRepo: Repository<PropertyRequest>,
  ) {}

  // 1. Crear la solicitud (Usuario logueado)
  async create(dto: CreateRequestPropertyDto, userId: number): Promise<PropertyRequest> {
    const newRequest = this.requestRepo.create({
      ...dto,
      userId,
      status: RequestStatus.ENVIADO, // Siempre nace en revisión
    });
    return await this.requestRepo.save(newRequest);
  }

  // 2. Ver todas las solicitudes (Solo Agente - Vista General)
  async findAll(): Promise<PropertyRequest[]> {
    return await this.requestRepo.find({
      relations: ['user'], // Traemos los datos del dueño para que el agente sepa de quién es
      order: { createdAt: 'DESC' }, 
    });
  }

  // 3. Ver una solicitud en detalle profundo
  async findOne(id: number): Promise<PropertyRequest> {
    const request = await this.requestRepo.findOne({
      where: { id },
      relations: ['user'], // Datos de contacto del dueño para la visita
    });

    if (!request) {
      throw new NotFoundException(`La solicitud con ID ${id} no existe`);
    }

    return request;
  }

  // 4. Buscar por Usuario (Usado por el Usuario en su Dashboard y por el Agente en el Perfil)
  async findByUser(userId: number): Promise<PropertyRequest[]> {
    const requests = await this.requestRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      relations: ['user'], // Opcional: Incluirlo por si el front necesita el nombre en la cabecera
    });

    if (!requests || requests.length === 0) {
      throw new NotFoundException(`No se encontraron solicitudes para el usuario #${userId}`);
    }

    return requests;
  }

  // 5. Método para actualizar el estado (Revision, Contactado, Tasando, etc.)
  async updateStatus(id: number, status: RequestStatus): Promise<PropertyRequest> {
    const request = await this.findOne(id);
    request.status = status;
    return await this.requestRepo.save(request);
  }

  // 6. Eliminar solicitud (Limpieza de base de datos)
  async remove(id: number): Promise<{ message: string }> {
    const request = await this.findOne(id);
    await this.requestRepo.remove(request);
    return { message: `Solicitud #${id} eliminada correctamente` };
  }


 // 8. EL USUARIO consulta una solicitud específica de su propia lista.
async findMyOne(id: number, userIdFromToken: number): Promise<PropertyRequest> {
  // 1. Buscamos la solicitud por su ID
  const request = await this.requestRepo.findOne({
    where: { id }
  });

  // 2. Si no existe, error 404
  if (!request) {
    throw new NotFoundException(`La solicitud #${id} no existe.`);
  }

  // 3. CONDICIONAL DE SEGURIDAD: 
  // Verificamos si el dueño de la solicitud es el mismo que está logueado
  if (request.userId !== userIdFromToken) {
    // Si los IDs son diferentes, bloqueamos el acceso (Error 403)
    throw new ForbiddenException('No tenés permiso para ver esta solicitud, no te pertenece.');
  }

  return request;
}
}