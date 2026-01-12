import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { UserSearchFeedback } from './entities/request.entity';
import { CreateUserSearchFeedbackDto } from './dto/create-request.dto';

@Injectable()
export class UserSearchFeedbackService {
  constructor(
    @InjectRepository(UserSearchFeedback)
    private readonly feedbackRepo: Repository<UserSearchFeedback>,
  ) {}

  // ---------------------------------------------------------
  // 1) CREAR FEEDBACK (Con limpieza y Anti-Spam)
  // ---------------------------------------------------------
  async createFeedback(dto: CreateUserSearchFeedbackDto) {
    const { deviceId } = dto;

    // Limpieza de strings para evitar duplicados por espacios
    if (dto.localidad) dto.localidad = dto.localidad.trim();
    if (dto.barrio) dto.barrio = dto.barrio.trim();
    if (dto.zone) dto.zone = dto.zone.trim();

    // Control Anti-Spam: 24 horas por dispositivo
    const limitDate = new Date();
    limitDate.setHours(limitDate.getHours() - 24);

    const recent = await this.feedbackRepo.findOne({
      where: {
        deviceId,
        createdAt: MoreThan(limitDate),
      },
    });

    if (recent) {
      throw new BadRequestException(
        'Ya hemos recibido tu búsqueda. Puedes enviar otra en 24 horas.',
      );
    }

    const feedback = this.feedbackRepo.create(dto);
    await this.feedbackRepo.save(feedback);

    return {
      message: 'Preferencias guardadas. ¡Gracias por ayudarnos a mejorar!',
      id: feedback.id,
    };
  }

  // ---------------------------------------------------------
  // 2) OBTENER TODOS (Para el Admin)
  // ---------------------------------------------------------
  async getAllFeedback() {
    return await this.feedbackRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  // ---------------------------------------------------------
  // 3) OBTENER UNO POR ID
  // ---------------------------------------------------------
  async getOneFeedback(id: number) {
    const found = await this.feedbackRepo.findOne({ where: { id } });

    if (!found) {
      throw new NotFoundException(`No se encontró el registro con ID ${id}`);
    }

    return found;
  }

  // ---------------------------------------------------------
  // 4) CHECK ANTI-SPAM (Para el Frontend)
  // ---------------------------------------------------------
  async checkDeviceCooldown(deviceId: string) {
    const limitDate = new Date();
    limitDate.setHours(limitDate.getHours() - 24);

    const recent = await this.feedbackRepo.findOne({
      where: {
        deviceId,
        createdAt: MoreThan(limitDate),
      },
    });

    return {
      canSend: !recent,
      nextAllowed: recent
        ? new Date(recent.createdAt.getTime() + 24 * 60 * 60 * 1000)
        : null,
    };
  }

  // ---------------------------------------------------------
  // 5) ESTADÍSTICAS PARA EL AGENTE (Zonas y Tipos)
  // ---------------------------------------------------------
  async getStats() {
    // Ranking de Localidades más buscadas
    const topZones = await this.feedbackRepo
      .createQueryBuilder('f')
      .select('f.localidad', 'name')
      .addSelect('COUNT(*)', 'value')
      .where('f.localidad IS NOT NULL')
      .groupBy('f.localidad')
      .orderBy('value', 'DESC')
      .limit(5)
      .getRawMany();

    // Ranking de Tipos de Propiedad (Casa, Depto, etc)
    const topTypes = await this.feedbackRepo
      .createQueryBuilder('f')
      .select('f.propertyType', 'type')
      .addSelect('COUNT(*)', 'total')
      .where('f.propertyType IS NOT NULL')
      .groupBy('f.propertyType')
      .orderBy('total', 'DESC')
      .getRawMany();

    return {
      topZones,
      topTypes,
      totalRequests: await this.feedbackRepo.count(),
    };
  }
}