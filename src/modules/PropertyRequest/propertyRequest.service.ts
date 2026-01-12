import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertyRequest, RequestStatus } from './entities/PropertyRequest';
import { CreateRequestPropertyDto } from './dto/createRequestPropertyDto';
import { PropertiesService } from '../properties/properties.service';
import { StatusProperty } from '../properties/dto/enumsStatusProperty';

@Injectable()
export class PropertyRequestService {
  constructor(
    @InjectRepository(PropertyRequest)
    private readonly requestRepo: Repository<PropertyRequest>, // <- EL CAMBIO ESTÁ AQUÍ
    private readonly propertiesService: PropertiesService,
) {}


  // 1. Crear la solicitud (Usuario logueado)
  async create(dto: CreateRequestPropertyDto, userId: number): Promise<PropertyRequest> {
    const newRequest = this.requestRepo.create({
      ...dto,
      userId,
      status: RequestStatus.REVISION, // Siempre nace en revisión
    });
    return await this.requestRepo.save(newRequest);
  }

  // 2. Ver todas las solicitudes (Solo Agente)
  async findAll(): Promise<PropertyRequest[]> {
    return await this.requestRepo.find({
      relations: ['user'], // Traemos los datos del dueño
      order: { createdAt: 'DESC' }, 
    });
  }

  // 3. Ver una solicitud en detalle
  async findOne(id: number): Promise<PropertyRequest> {
    const request = await this.requestRepo.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!request) {
      throw new NotFoundException(`La solicitud con ID ${id} no existe`);
    }

    return request;
  }

  // 4. Eliminar solicitud
  async remove(id: number): Promise<{ message: string }> {
    const request = await this.findOne(id);
    await this.requestRepo.remove(request);
    return { message: `Solicitud #${id} eliminada correctamente` };
  }

  // 5. Método para actualizar solo el estado (Aceptada/Rechazada)
  async updateStatus(id: number, status: RequestStatus): Promise<PropertyRequest> {
    const request = await this.findOne(id);
    request.status = status;
    return await this.requestRepo.save(request);
  }
  // Dentro de PropertyRequestService

// async updateStatus(id: number, status: RequestStatus): Promise<PropertyRequest> {
//   const request = await this.findOne(id); // Trae toda la info del usuario y la casa
  
//   if (status === RequestStatus.ACEPTADA && request.status !== RequestStatus.ACEPTADA) {
//     // LLAMADA AL OTRO SERVICIO
//     await this.propertiesService.create({
//       title: `${request.tipoPropiedad} en ${request.barrio}`, // Título genérico inicial
//       description: request.mensajeAgente,
//       price: request.precioEstimado,
//       images: request.images, // Reutilizamos las URLs de Cloudinary
//       address: `${request.barrio}, ${request.localidad}`,
//       // ... todos los demás campos técnicos (m2, baños, etc)
//     });
//   }

//   request.status = status;
//   return await this.requestRepo.save(request);
// }

  // 6. Para que el usuario vea sus solicitudes en su dashboard
  
  async findByUser(userId: number): Promise<PropertyRequest[]> {
    return await this.requestRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }
}