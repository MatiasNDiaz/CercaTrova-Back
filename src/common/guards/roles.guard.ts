import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from 'src/modules/users/enums/role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      // Si la ruta no tiene roles definidos, cualquiera puede pasar
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    // El 'user' viene del JwtStrategy -> validate()

    return requiredRoles.some((requiredRole) => requiredRole === user.role);
  }
}
