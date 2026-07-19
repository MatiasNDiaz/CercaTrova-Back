// src/common/helpers/ensure-exists.helper.ts
import { NotFoundException } from '@nestjs/common';
import { FindOptionsWhere, ObjectLiteral, Repository } from 'typeorm';

// 🧱 PATRÓN (ERROR_FIXES): validar que una entidad referenciada exista ANTES
// de usarla o guardarla. Sin esto, la violación de FK de Postgres llega al
// cliente como un 500 crudo en vez de un 404 claro.
// Uso: const prop = await ensureExists(propertyRepo, id, 'La propiedad indicada');
// → lanza 404 "La propiedad indicada no existe" si no está.
export async function ensureExists<T extends ObjectLiteral>(
  repo: Repository<T>,
  id: number,
  entityName: string,
): Promise<T> {
  const found = await repo.findOne({
    where: { id } as unknown as FindOptionsWhere<T>,
  });
  if (!found) {
    throw new NotFoundException(`${entityName} no existe`);
  }
  return found;
}
