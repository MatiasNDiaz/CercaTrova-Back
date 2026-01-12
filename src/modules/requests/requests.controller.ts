import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { UserSearchFeedbackService } from './requests.service';
import { CreateUserSearchFeedbackDto } from './dto/create-request.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '../users/enums/role.enum';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/common/guards/roles.guard'; // Asegúrate de tener este guard

@Controller('feedback/search')
export class UserSearchFeedbackController {
  constructor(
    private readonly feedbackService: UserSearchFeedbackService,
  ) {}

  // --------------------------------------------------------
  // 1) CREAR FEEDBACK (Público - Usuario NO logueado)
  // --------------------------------------------------------
  @Post()
  async create(@Body() dto: CreateUserSearchFeedbackDto) {
    if (!dto.deviceId) {
      throw new BadRequestException('El deviceId es obligatorio para evitar spam.');
    }
    return this.feedbackService.createFeedback(dto);
  }

  // --------------------------------------------------------
  // 2) CHECK ANTI-SPAM (Público)
  // --------------------------------------------------------
  @Get('check/:deviceId')
  checkDevice(@Param('deviceId') deviceId: string) {
    return this.feedbackService.checkDeviceCooldown(deviceId);
  }

  // --------------------------------------------------------
  // 3) ESTADÍSTICAS DE BÚSQUEDA (Solo ADMIN/AGENTE)
  // --------------------------------------------------------
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  @Get('stats/zones')
  getZoneStats() {
    return this.feedbackService.getStats();
  }

  // --------------------------------------------------------
  // 4) OBTENER TODO EL FEEDBACK (Solo ADMIN/AGENTE)
  // --------------------------------------------------------
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  getAll() {
    return this.feedbackService.getAllFeedback();
  }

  // --------------------------------------------------------
  // 5) OBTENER UN FEEDBACK POR ID (Solo ADMIN/AGENTE)
  // --------------------------------------------------------
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.feedbackService.getOneFeedback(+id);
  }
}