// src/modules/PropertyRequest/dto/updateRequestStatusDto.ts
import { IsEnum } from 'class-validator';
import { RequestStatus } from '../entities/PropertyRequest';

// DTO para PATCH /property-requests/:id/status — antes se usaba
// @Body('status') suelto sin validación y un valor fuera del enum de
// Postgres reventaba con 500.
export class UpdateRequestStatusDto {
  @IsEnum(RequestStatus, {
    message: `Estado inválido. Valores permitidos: ${Object.values(RequestStatus).join(', ')}`,
  })
  status: RequestStatus;
}
