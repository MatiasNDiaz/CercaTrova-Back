// (F10): tests de JwtAuthGuard — verifican el comportamiento de @Public()
import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

const fakeContext = {
  getHandler: () => ({}),
  getClass: () => ({}),
} as unknown as ExecutionContext;

// El "super" de JwtAuthGuard es la clase mixin AuthGuard('jwt')
const superProto = Object.getPrototypeOf(JwtAuthGuard.prototype);

describe('JwtAuthGuard', () => {
  afterEach(() => jest.restoreAllMocks());

  it('permite el acceso directo en rutas @Public(), sin verificar JWT', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    const guard = new JwtAuthGuard(reflector as any);
    const superSpy = jest.spyOn(superProto, 'canActivate');

    expect(guard.canActivate(fakeContext)).toBe(true);
    expect(superSpy).not.toHaveBeenCalled();
  });

  it('delega en la verificación JWT de passport si la ruta NO es pública', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    const guard = new JwtAuthGuard(reflector as any);
    const superSpy = jest
      .spyOn(superProto, 'canActivate')
      .mockReturnValue(true);

    expect(guard.canActivate(fakeContext)).toBe(true);
    expect(superSpy).toHaveBeenCalledWith(fakeContext);
  });
});
