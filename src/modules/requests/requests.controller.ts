import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { UserSearchFeedbackService } from './requests.service';
import { CreateUserSearchFeedbackDto } from './dto/create-request.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '../users/enums/role.enum';

@Controller('feedback/search')
export class UserSearchFeedbackController {
  constructor(
    private readonly feedbackService: UserSearchFeedbackService,
  ) {}

  
    // --------------------------------------------------------
    // 4) CHECK ANTI-SPAM 24 HS
    // --------------------------------------------------------
    @Get('check/:deviceId')
    checkDevice(@Param('deviceId') deviceId: string) {
      return this.feedbackService.checkDeviceCooldown(deviceId);
    }
  // --------------------------------------------------------
  // 1) CREAR FEEDBACK (usuario NO logueado)
  // --------------------------------------------------------
  @Post()
  async create(@Body() dto: CreateUserSearchFeedbackDto) {
    if (!dto.deviceId) {
      throw new BadRequestException('deviceId es obligatorio');
    }

    return this.feedbackService.createFeedback(dto);
  }

  // --------------------------------------------------------
  // 2) OBTENER TODO EL FEEDBACK (SOLO ADMIN/AGENTE)
  // --------------------------------------------------------
  @Roles(Role.ADMIN)
  @Get()
  getAll() {
    return this.feedbackService.getAllFeedback();
  }

  // --------------------------------------------------------
  // 3) OBTENER UN FEEDBACK POR ID
  // --------------------------------------------------------
  @Roles(Role.ADMIN)
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.feedbackService.getOneFeedback(+id);
  }
}
