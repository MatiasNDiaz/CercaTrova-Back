import { Controller, Get, Patch, Param, UseGuards, Req } from '@nestjs/common';
import { NotificationService } from './notifications.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '../users/enums/role.enum';
import { RolesGuard } from 'src/common/guards/roles.guard';

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
  // 🔒 SEGURIDAD (M6): se pasa el usuario del token para validar ownership
  @Patch(':id/read')
  markAsRead(@Param('id') id: number, @Req() req) {
    return this.service.markAsRead(+id, req.user.id, req.user.role);
  }

  // PATCH /notifications/read-all — marcar todas como leídas
  @Patch('read-all')
  markAllAsRead(@Req() req) {
    return this.service.markAllAsRead(req.user.id);
  }




// GET /notifications/admin — notificaciones del admin
@Get('admin')
@Roles(Role.ADMIN)
@UseGuards(RolesGuard)
getForAdmin() {
  return this.service.getForAdmin();
}

// PATCH /notifications/admin/read-all — marcar todas como leídas
@Patch('admin/read-all')
@Roles(Role.ADMIN)
@UseGuards(RolesGuard)
markAllAdminAsRead() {
  return this.service.markAllAdminAsRead();
}

// PATCH /notifications/:id/read ya existe y sirve para ambos roles
}