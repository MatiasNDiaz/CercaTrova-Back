import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Este decorador extrae el objeto 'user' que el JwtAuthGuard 
 * pega en la request después de validar el token.
 */
export const GetUser = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user; 
    
    // Si en el controller pones @GetUser('id'), te devuelve solo el ID.
    // Si pones @GetUser(), te devuelve todo el objeto del usuario.
    return data ? user?.[data] : user;
  },
);