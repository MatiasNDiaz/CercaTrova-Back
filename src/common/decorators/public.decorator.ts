// src/common/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Este decorador simplemente marca el endpoint con una bandera 'true'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);