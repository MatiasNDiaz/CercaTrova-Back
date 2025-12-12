import { Controller, Get, Param } from '@nestjs/common';
import { NotificationService } from './notifications.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get(':userId')
  getForUser(@Param('userId') userId: number) {
    return this.service.getForUser(userId);
  }
}
