// (F10): tests de RolesGuard — blindan los hallazgos C3/C4/C6 (roles
// decorativos) y M5 (crash sin user) de AUDIT.md
import { Reflector } from '@nestjs/core';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { Role } from 'src/modules/users/enums/role.enum';

// Contexto de ejecución mínimo con el user deseado en la request
const contextWithUser = (user: unknown): ExecutionContext =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('permite pasar si la ruta no define roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextWithUser(undefined))).toBe(true);
  });

  it('lanza ForbiddenException (403, no un TypeError→500) si no hay user (M5)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('rechaza si el rol del user no coincide con el requerido', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(contextWithUser({ role: Role.USER }))).toBe(false);
  });

  it('permite si el rol del user coincide con el requerido', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(contextWithUser({ role: Role.ADMIN }))).toBe(true);
  });
});
