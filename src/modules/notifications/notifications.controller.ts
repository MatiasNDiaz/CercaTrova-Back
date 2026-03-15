import { Controller, Get, Patch, Param, UseGuards, Req } from '@nestjs/common';
import { NotificationService } from './notifications.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard) // ← protege todos los endpoints
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  // GET /notifications — notificaciones del usuario logueado
  @Get()
  getForUser(@Req() req) {
    return this.service.getForUser(req.user.id);
  }

  // PATCH /notifications/:id/read — marcar una como leída
  @Patch(':id/read')
  markAsRead(@Param('id') id: number) {
    return this.service.markAsRead(+id);
  }

  // PATCH /notifications/read-all — marcar todas como leídas
  @Patch('read-all')
  markAllAsRead(@Req() req) {
    return this.service.markAllAsRead(req.user.id);
  }
}