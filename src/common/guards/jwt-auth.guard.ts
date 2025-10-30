// src/auth/guards/jwt-auth.guard.ts
import { 
  Injectable, 
  ExecutionContext 
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core'; // Necesario para leer los metadatos
import { IS_PUBLIC_KEY } from 'src/common/decorators/public.decorator'; // La clave que definiste

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  
  // 1. Inyectamos el Reflector para leer los metadatos del decorador @Public()
  constructor(private reflector: Reflector) {
    super();
  }

  // 2. Sobrescribimos el método canActivate
  canActivate(context: ExecutionContext) {
    
    // Lee los metadatos 'isPublic' de la ruta (método) o del controlador (clase)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), // Intenta leer el decorador en el método
      context.getClass(),   // Intenta leer el decorador en el controlador
    ]);

    if (isPublic) {
      // Si la ruta está marcada con @Public(), permitimos el acceso inmediatamente,
      // sin requerir la verificación del token JWT.
      return true;
    }

    // Si la ruta NO es pública, llamamos a la lógica base de AuthGuard
    // para verificar el JWT. Si es inválido, lanzará un 401 Unauthorized.
    return super.canActivate(context);
  }
} 