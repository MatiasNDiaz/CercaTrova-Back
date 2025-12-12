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
  // 1) CREAR FEEDBACK (con control anti-spam 24 horas)
  // ---------------------------------------------------------
  async createFeedback(dto: CreateUserSearchFeedbackDto) {
    const { deviceId } = dto;

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
        'Solo puedes enviar el formulario una vez cada 24 horas.',
      );
    }

    const feedback = this.feedbackRepo.create(dto);
    await this.feedbackRepo.save(feedback);

    return {
      message: 'Feedback registrado correctamente',
      feedback,
    };
  }

  // ---------------------------------------------------------
  // 2) OBTENER TODOS LOS FEEDBACKS (ADMIN/AGENTE)
  // ---------------------------------------------------------
  async getAllFeedback() {
    return await this.feedbackRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  // ---------------------------------------------------------
  // 3) OBTENER UN FEEDBACK POR ID
  // ---------------------------------------------------------
  async getOneFeedback(id: number) {
    const found = await this.feedbackRepo.findOne({ where: { id } });

    if (!found) {
      throw new NotFoundException(`No existe el feedback con ID ${id}`);
    }

    return found;
  }

  // ---------------------------------------------------------
  // 4) CHECK ANTI-SPAM 24 HS
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
      deviceId,
      canSend: !recent,
      nextAllowed: recent
        ? new Date(recent.createdAt.getTime() + 24 * 60 * 60 * 1000)
        : null,
    };
  }
}
