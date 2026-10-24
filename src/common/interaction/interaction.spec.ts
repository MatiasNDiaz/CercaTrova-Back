// Interacciones sin iniciar sesión: identificación del visitante, validación,
// rate limit, honeypot y que los datos internos nunca salgan.
import { ExecutionContext, HttpException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { actorFromRequest, hashIp, isUuid, displayName, clientIp } from './interaction-actor';
import { CommentRateLimitGuard, ReactionRateLimitGuard, resetInteractionRateLimits } from './interaction-rate-limit.guard';
import { isHoneypotFilled } from './interaction.dto';
import { CreateCommentDto } from 'src/modules/comments/dto/create-comment.dto';
import { CreatePostCommentDto } from 'src/modules/posts/dto/post-comment.dto';
import { CreateRatingDto } from 'src/modules/ratings/dto/create-rating.dto';
import { Role } from 'src/modules/users/enums/role.enum';

const VID = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
const req = (over: Record<string, unknown> = {}) =>
  ({ headers: {}, cookies: {}, ip: '10.0.0.1', socket: {}, ...over }) as never;
const ctx = (r: unknown) =>
  ({ switchToHttp: () => ({ getRequest: () => r }) }) as unknown as ExecutionContext;
const errorsOf = async (cls: new () => object, plain: object) =>
  validate(plainToInstance(cls, plain), { whitelist: true, forbidNonWhitelisted: true });

describe('InteractionActor', () => {
  it('sin sesión ni cookie → anónimo sin visitorId', () => {
    const a = actorFromRequest(req());
    expect(a.userId).toBeNull();
    expect(a.visitorId).toBeNull();
  });

  it('toma el visitorId de la cookie ct_vid solo si es un UUID', () => {
    expect(actorFromRequest(req({ cookies: { ct_vid: VID } })).visitorId).toBe(VID);
    expect(actorFromRequest(req({ cookies: { ct_vid: 'no-es-un-uuid' } })).visitorId).toBeNull();
    expect(isUuid('desconocido')).toBe(false);
  });

  it('con sesión válida asocia la interacción a la cuenta', () => {
    const a = actorFromRequest(req({ user: { id: 7, role: Role.USER }, cookies: { ct_vid: VID } }));
    expect(a.userId).toBe(7);
    expect(a.role).toBe(Role.USER);
  });

  it('token inválido (OptionalJwtAuthGuard deja user = null) → se trata como anónimo, no 401', () => {
    expect(actorFromRequest(req({ user: null, cookies: { ct_vid: VID } })).userId).toBeNull();
  });

  it('usa req.ip (resuelto por trust proxy) y NO un x-forwarded-for que mande el cliente', () => {
    expect(clientIp(req({ ip: '200.1.2.3', headers: { 'x-forwarded-for': '6.6.6.6' } }))).toBe('200.1.2.3');
  });

  it('la IP se guarda solo como hash SHA-256 (nunca en texto plano)', () => {
    const h = hashIp('200.1.2.3');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('200.1.2.3');
    expect(hashIp('200.1.2.3')).toBe(h); // determinista: sirve para contar
  });

  it('nombre a mostrar: usuario > nombre del visitante > "Visitante"', () => {
    expect(displayName({ user: { name: 'Ana' }, guestName: 'x' })).toBe('Ana');
    expect(displayName({ user: null, guestName: 'Juan' })).toBe('Juan');
    expect(displayName({ user: null, guestName: '   ' })).toBe('Visitante');
    expect(displayName({ user: null, guestName: null })).toBe('Visitante');
  });
});

describe('Validación de comentarios y estrellas', () => {
  it('rechaza un comentario vacío o de solo espacios', async () => {
    expect((await errorsOf(CreateCommentDto, { message: '' })).length).toBeGreaterThan(0);
    expect((await errorsOf(CreateCommentDto, { message: '    ' })).length).toBeGreaterThan(0);
    expect((await errorsOf(CreatePostCommentDto, { content: '\n\t ' })).length).toBeGreaterThan(0);
  });

  it('rechaza un comentario de más de 1000 caracteres y acepta 1000', async () => {
    expect((await errorsOf(CreateCommentDto, { message: 'a'.repeat(1001) })).length).toBeGreaterThan(0);
    expect(await errorsOf(CreateCommentDto, { message: 'a'.repeat(1000) })).toHaveLength(0);
  });

  it('el nombre del visitante es opcional y de hasta 50 caracteres', async () => {
    expect(await errorsOf(CreatePostCommentDto, { content: 'hola' })).toHaveLength(0);
    expect(await errorsOf(CreatePostCommentDto, { content: 'hola', guestName: 'Juan' })).toHaveLength(0);
    expect((await errorsOf(CreatePostCommentDto, { content: 'hola', guestName: 'x'.repeat(51) })).length).toBeGreaterThan(0);
  });

  it('rechaza estrellas fuera de 1..5 o no enteras', async () => {
    for (const score of [0, 6, -1, 2.5]) {
      expect((await errorsOf(CreateRatingDto, { score })).length).toBeGreaterThan(0);
    }
    for (const score of [1, 3, 5]) {
      expect(await errorsOf(CreateRatingDto, { score })).toHaveLength(0);
    }
  });

  it('detecta el honeypot completo', () => {
    expect(isHoneypotFilled({ website: 'http://spam' })).toBe(true);
    expect(isHoneypotFilled({ website: '' })).toBe(false);
    expect(isHoneypotFilled({})).toBe(false);
  });
});

describe('Rate limit de interacciones', () => {
  beforeEach(() => resetInteractionRateLimits());
  afterEach(() => {
    delete process.env.INTERACTION_COMMENTS_PER_MIN;
    delete process.env.INTERACTION_REACTIONS_PER_MIN;
  });

  it('5 comentarios por minuto por visitante; el 6º responde 429', () => {
    const guard = new CommentRateLimitGuard();
    const r = req({ cookies: { ct_vid: VID } });
    for (let i = 0; i < 5; i++) expect(guard.canActivate(ctx(r))).toBe(true);
    try {
      guard.canActivate(ctx(r));
      fail('debía responder 429');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(429);
      expect((e as HttpException).message).toMatch(/Esperá un minuto/);
    }
  });

  it('el límite es configurable por variable de entorno', () => {
    process.env.INTERACTION_REACTIONS_PER_MIN = '2';
    const guard = new ReactionRateLimitGuard();
    const r = req({ cookies: { ct_vid: VID } });
    guard.canActivate(ctx(r));
    guard.canActivate(ctx(r));
    expect(() => guard.canActivate(ctx(r))).toThrow(HttpException);
  });

  it('cambiar de cookie no saltea el límite de la IP', () => {
    process.env.INTERACTION_COMMENTS_PER_MIN = '1'; // por IP = 3
    const guard = new CommentRateLimitGuard();
    const ip = { ip: '200.9.9.9' };
    const ids = ['a', 'b', 'c', 'd'].map((c) => `${c}${VID.slice(1)}`);
    ids.slice(0, 3).forEach((id) => expect(guard.canActivate(ctx(req({ ...ip, cookies: { ct_vid: id } })))).toBe(true));
    expect(() => guard.canActivate(ctx(req({ ...ip, cookies: { ct_vid: ids[3] } })))).toThrow(HttpException);
  });
});
