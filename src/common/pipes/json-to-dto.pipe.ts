// src/common/pipes/json-to-dto.pipe.ts
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

/**
 * Mensajes de un árbol de errores de class-validator, incluidos los de
 * objetos ANIDADOS (`@ValidateNested`). Antes solo se leía el primer nivel:
 * un error dentro de un array de objetos (ej. la galería `media` de una
 * publicación) llegaba al cliente como `message: []`, un 400 sin explicación.
 */
function collectMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...collectMessages(e.children ?? []),
  ]);
}

// 🔒 SEGURIDAD (M4): pipe para endpoints multipart que reciben el DTO como
// string JSON dentro de un campo del form-data (ej: @Body('data')).
// Parsea el JSON y lo valida con class-validator aplicando las MISMAS
// reglas que el ValidationPipe global (whitelist + forbidNonWhitelisted),
// que el JSON.parse() manual salteaba por completo.
@Injectable()
export class JsonToDtoPipe<T extends object> implements PipeTransform<string, Promise<T>> {
  constructor(private readonly dtoClass: new () => T) {}

  async transform(rawData: string): Promise<T> {
    if (typeof rawData !== 'string' || rawData.length === 0) {
      throw new BadRequestException("El campo 'data' es obligatorio y debe ser JSON válido");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      throw new BadRequestException("El campo 'data' debe ser JSON válido");
    }

    const dto = plainToInstance(this.dtoClass, parsed, {
      enableImplicitConversion: true,
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const messages = collectMessages(errors);
      throw new BadRequestException(messages);
    }

    return dto;
  }
}
