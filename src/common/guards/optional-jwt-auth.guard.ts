import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Autenticación OPCIONAL: puebla `request.user` si viene un token válido, pero
 * NUNCA rechaza la request si no hay token o si es inválido.
 *
 * Por qué hace falta: `JwtAuthGuard` cortocircuita con `return true` en las
 * rutas marcadas con `@Public()`, sin llegar a ejecutar passport. Eso está bien
 * para "cualquiera puede entrar", pero deja `request.user` vacío incluso cuando
 * el visitante SÍ está logueado — y hay rutas públicas que necesitan saberlo:
 *
 *   · `GET /posts` → marcar `likedByMe` en cada publicación.
 *   · `GET /posts/:id/comments` → mostrarle los comentarios ocultos al admin.
 *
 * Se usa a nivel de método, sumado (no en reemplazo) al guard de la clase.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // Sin sesión válida: se sigue como anónimo.
    }
    return true;
  }

  /**
   * Passport llama a esto con el resultado de la estrategia. Devolver el user
   * (o `null`) en vez de lanzar es lo que hace que un token ausente/vencido no
   * corte la request.
   */
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser | null {
    return user ?? null;
  }
}
