import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertyRequest, RequestStatus } from './entities/PropertyRequest';
import { CreateRequestPropertyDto } from './dto/createRequestPropertyDto';
import { NotificationService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class PropertyRequestService {
  constructor(
    @InjectRepository(PropertyRequest)
    private readonly requestRepo: Repository<PropertyRequest>,
    private readonly notificationService: NotificationService,
     private readonly usersService: UsersService, // 👈
  ) {}

  async create(dto: CreateRequestPropertyDto, userId: number): Promise<PropertyRequest> {
    const newRequest = this.requestRepo.create({
      ...dto,
      userId,
      status: RequestStatus.ENVIADO,
    });

    const saved = await this.requestRepo.save(newRequest);

    // 👇 Buscar el usuario para obtener nombre y apellido reales
    const user = await this.usersService.getUserById(userId).catch(() => null);
    const userName = user
      ? `${user.name}${user.surname ? ' ' + user.surname : ''}`.trim()
      : `Usuario #${userId}`;

    this.notificationService
      .notifyAdminNewPropertyRequest({
        userName, // 👈 nombre real
        direccion: dto.direccion,
        barrio: dto.barrio,
        localidad: dto.localidad,
        relatedUserId: userId, // 👈
      })
      .catch((err) => console.error('[NOTIF ADMIN] Error en solicitud:', err));

    return saved;
  }

  async findAll(): Promise<PropertyRequest[]> {
    return await this.requestRepo.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<PropertyRequest> {
    const request = await this.requestRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!request) throw new NotFoundException(`La solicitud con ID ${id} no existe`);
    return request;
  }

  async findByUser(userId: number): Promise<PropertyRequest[]> {
    return await this.requestRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      relations: ['user'],
    });
  }

  async updateStatus(id: number, status: RequestStatus): Promise<PropertyRequest> {
    const request = await this.findOne(id);
    request.status = status;
    const saved = await this.requestRepo.save(request);

    this.notificationService.handleRequestStatusChange(saved).catch((err) =>
      console.error('[ERROR] No se pudo notificar cambio de estado:', err),
    );

    return saved;
  }

  async remove(id: number): Promise<{ message: string }> {
    const request = await this.findOne(id);
    await this.requestRepo.remove(request);
    return { message: `Solicitud #${id} eliminada correctamente` };
  }

  async findMyOne(id: number, userIdFromToken: number): Promise<PropertyRequest> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException(`La solicitud #${id} no existe.`);
    if (request.userId !== userIdFromToken)
      throw new ForbiddenException('No tenés permiso para ver esta solicitud.');
    return request;
  }
}