import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertyRequest, RequestStatus } from './entities/PropertyRequest';
import { CreateRequestPropertyDto } from './dto/createRequestPropertyDto';
import { NotificationService } from '../notifications/notifications.service';

@Injectable()
export class PropertyRequestService {
  constructor(
    @InjectRepository(PropertyRequest)
    private readonly requestRepo: Repository<PropertyRequest>,
    private readonly notificationService: NotificationService,
  ) {}

  // 1. Crear la solicitud (Usuario logueado)
  async create(dto: CreateRequestPropertyDto, userId: number): Promise<PropertyRequest> {
    const newRequest = this.requestRepo.create({
      ...dto,
      userId,
      status: RequestStatus.ENVIADO,
    });
    return await this.requestRepo.save(newRequest);
  }

  // 2. Ver todas las solicitudes (Solo Agente)
  async findAll(): Promise<PropertyRequest[]> {
    return await this.requestRepo.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  // 3. Ver una solicitud en detalle
  async findOne(id: number): Promise<PropertyRequest> {
    const request = await this.requestRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!request) throw new NotFoundException(`La solicitud con ID ${id} no existe`);
    return request;
  }

  // 4. Buscar por Usuario
  // ← Fix: devuelve [] en lugar de 404 cuando no hay solicitudes
  async findByUser(userId: number): Promise<PropertyRequest[]> {
    return await this.requestRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      relations: ['user'],
    });
  }

  // 5. Cambiar estado + notificar al usuario
  async updateStatus(id: number, status: RequestStatus): Promise<PropertyRequest> {
    const request = await this.findOne(id); // ya trae relations: ['user']
    request.status = status;
    const saved = await this.requestRepo.save(request);

    // Notificar en background — no bloquea la respuesta
    this.notificationService.handleRequestStatusChange(saved).catch((err) =>
      console.error('[ERROR] No se pudo notificar cambio de estado:', err),
    );

    return saved;
  }

  // 6. Eliminar solicitud
  async remove(id: number): Promise<{ message: string }> {
    const request = await this.findOne(id);
    await this.requestRepo.remove(request);
    return { message: `Solicitud #${id} eliminada correctamente` };
  }

  // 7. El usuario ve una solicitud específica suya (con verificación de ownership)
  async findMyOne(id: number, userIdFromToken: number): Promise<PropertyRequest> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException(`La solicitud #${id} no existe.`);
    if (request.userId !== userIdFromToken)
      throw new ForbiddenException('No tenés permiso para ver esta solicitud.');
    return request;
  }
}