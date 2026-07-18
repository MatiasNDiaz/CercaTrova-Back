// src/common/pipes/json-to-dto.pipe.ts
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

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
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      throw new BadRequestException(messages);
    }

    return dto;
  }
}
