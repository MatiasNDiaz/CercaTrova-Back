import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { FrontendAwareRequest } from 'src/common/http/trusted-proxy';

/**
 * Rate limit global por IP, salvo para las requests del propio servidor del
 * front (SSR en Vercel, autenticadas con `PROXY_SHARED_SECRET`): esas no son
 * un visitante sino todos a la vez, y limitarlas por IP daba 429 a la landing
 * y al catálogo en los picos. Ver `trusted-proxy.ts`.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FrontendAwareRequest>();
    if (req?.fromFrontendServer) return true;
    return super.shouldSkip(context);
  }
}
