import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { TrackingService } from './tracking.service';
import { RecordVisitDto, RecordDurationDto } from './dto/tracking.dto';
import { getVisitorId } from './visitor-id.middleware';
import { Public } from 'src/common/decorators/public.decorator';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';
import { Role } from '../users/enums/role.enum';

/**
 * Endpoints de telemetría del sitio.
 *
 * Son PÚBLICOS a propósito: hay que medir también a los visitantes sin sesión.
 * `OptionalJwtAuthGuard` puebla `req.user` cuando sí hay sesión, para poder
 * asociar la visita y excluir al admin de las métricas.
 *
 * Llevan un `@Throttle` propio y más alto que el global: el frontend puede
 * emitir varias visitas seguidas al navegar entre páginas, pero tampoco
 * queremos que alguien infle las métricas a mano.
 */
@Controller('tracking')
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('visit')
  recordVisit(
    @Body() dto: RecordVisitDto,
    @Req() req: Request,
    @GetUser('id') userId?: number,
    @GetUser('role') role?: Role,
  ) {
    return this.trackingService.recordVisit({
      visitorId: getVisitorId(req),
      path: dto.path,
      userId,
      role,
    });
  }

  /**
   * Cierre de una visita con su duración.
   * Lo llama el frontend con `navigator.sendBeacon` al ocultarse la pestaña.
   */
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('duration')
  async recordDuration(@Body() dto: RecordDurationDto, @Req() req: Request) {
    await this.trackingService.recordDuration(dto.visitId, getVisitorId(req), dto.durationMs);
    return { ok: true };
  }
}
