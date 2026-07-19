import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertyRequest, RequestStatus } from './entities/PropertyRequest';

// (ERROR_FIXES R-15): transiciones válidas del ciclo de vida de una solicitud.
// "aceptado" es terminal; una "rechazada" puede reconsiderarse volviendo a
// revisión. Cambiar al mismo estado tampoco es una transición válida.
const VALID_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  [RequestStatus.ENVIADO]: [RequestStatus.REVISION, RequestStatus.ACEPTADO, RequestStatus.RECHAZADO],
  [RequestStatus.REVISION]: [RequestStatus.ACEPTADO, RequestStatus.RECHAZADO],
  [RequestStatus.ACEPTADO]: [],
  [RequestStatus.RECHAZADO]: [RequestStatus.REVISION],
};
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

    // (F3): notificar también al usuario "tu solicitud fue recibida" — el
    // template del estado ENVIADO existía pero nunca se disparaba al crear.
    // handleRequestStatusChange necesita request.user cargado; reusamos el
    // usuario ya buscado más arriba.
    if (user) {
      saved.user = user;
      this.notificationService
        .handleRequestStatusChange(saved)
        .catch((err) =>
          console.error('[NOTIF USER] Error notificando solicitud recibida:', err),
        );
    }

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

    // (ERROR_FIXES R-15): rechazar transiciones ilegales con un 409 claro
    if (!VALID_TRANSITIONS[request.status]?.includes(status)) {
      throw new ConflictException(
        `No se puede pasar la solicitud de '${request.status}' a '${status}'`,
      );
    }

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