// src/common/helpers/handle-service-error.helper.ts
import {
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

// 🧱 PATRÓN (ERROR_FIXES): manejo consistente de errores en un catch de service.
// - Una HttpException construida a propósito se RE-LANZA tal cual (nunca se
//   re-envuelve ni se le concatena nada).
// - Cualquier otro error se loguea COMPLETO internamente (Logger de Nest) y
//   el cliente recibe solo un mensaje genérico — jamás error.message de la DB.
export function handleServiceError(
  logger: Logger,
  error: unknown,
  publicMessage: string,
): never {
  if (error instanceof HttpException) throw error;
  logger.error(
    publicMessage,
    error instanceof Error ? error.stack : String(error),
  );
  throw new InternalServerErrorException(publicMessage);
}
