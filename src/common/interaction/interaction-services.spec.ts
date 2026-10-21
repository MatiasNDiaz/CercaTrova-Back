// Servicios de interacción con repositorios simulados: comentarios y
// calificaciones de visitantes, toggle de "me gusta", honeypot, permisos y que
// `visitorId`/`ipHash` nunca salgan en las respuestas públicas.
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CommentsService } from 'src/modules/comments/comments.service';
import { RatingsService } from 'src/modules/ratings/ratings.service';
import { PostsService } from 'src/modules/posts/posts.service';
import { InteractionActor } from './interaction-actor';
import { Role } from 'src/modules/users/enums/role.enum';

const VID = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
const guest: InteractionActor = { userId: null, role: null, visitorId: VID, ipHash: 'h'.repeat(64), ip: '1.1.1.1' };
const logged: InteractionActor = { userId: 7, role: Role.USER, visitorId: VID, ipHash: 'h'.repeat(64), ip: '1.1.1.1' };
const notif = () => ({
  notifyAdminNewComment: jest.fn().mockResolvedValue(undefined),
  notifyAdminNewRating: jest.fn().mockResolvedValue(undefined),
  notifyAdminNewPostComment: jest.fn().mockResolvedValue(undefined),
  notifyCommentReply: jest.fn().mockResolvedValue(undefined),
});
const PRIVATE_KEYS = ['visitorId', 'ipHash', 'visitor_id', 'ip_hash'];
const hasPrivate = (o: object) => PRIVATE_KEYS.some((k) => JSON.stringify(o).includes(`"${k}"`));

// ── Comentarios de propiedades ───────────────────────────────────────────────
function commentsSetup() {
  const saved: Record<string, unknown>[] = [];
  const commentRepo = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => { const row = { id: saved.length + 1, ...x }; saved.push(row); return row; }),
    // La forma pública: lo que devolvería un `select` sin las columnas internas.
    findOne: jest.fn(async ({ where }) => {
      const row = saved.find((r) => r.id === where.id);
      if (!row) return null;
      const { visitorId: _v, ipHash: _i, property: _p, ...pub } = row as Record<string, unknown>;
      return { ...pub, userId: (row.user as { id?: number } | null)?.id ?? null };
    }),
    remove: jest.fn(),
  };
  const propertyRepo = { findOne: jest.fn().mockResolvedValue({ id: 1, title: 'Casa' }) };
  const userRepo = { findOne: jest.fn().mockResolvedValue({ id: 7, name: 'Ana' }) };
  const n = notif();
  const svc = new CommentsService(commentRepo as never, propertyRepo as never, userRepo as never, n as never);
  return { svc, saved, commentRepo, n };
}

describe('Comentarios de propiedades', () => {
  it('un visitante sin sesión comenta y queda guardado como anónimo', async () => {
    const { svc, saved } = commentsSetup();
    const res = await svc.create(1, guest, { message: 'Muy linda', guestName: 'Juan' });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ message: 'Muy linda', user: null, guestName: 'Juan', visitorId: VID });
    expect(res).toMatchObject({ authorName: 'Juan', isAnonymous: true });
  });

  it('sin nombre se muestra "Visitante"', async () => {
    const { svc } = commentsSetup();
    expect(await svc.create(1, guest, { message: 'hola' })).toMatchObject({ authorName: 'Visitante' });
  });

  it('un usuario logueado sigue asociado a su cuenta (y se ignora guestName)', async () => {
    const { svc, saved } = commentsSetup();
    const res = await svc.create(1, logged, { message: 'hola', guestName: 'Otro' });
    expect(saved[0]).toMatchObject({ user: { id: 7 }, guestName: null });
    expect(res).toMatchObject({ authorName: 'Ana', isAnonymous: false });
  });

  it('el honeypot completo descarta el comentario en silencio', async () => {
    const { svc, saved, n } = commentsSetup();
    const res = await svc.create(1, guest, { message: 'spam', website: 'http://spam.example' });
    expect(saved).toHaveLength(0);
    expect(n.notifyAdminNewComment).not.toHaveBeenCalled();
    expect(res).toBeTruthy(); // el bot recibe una respuesta "exitosa"
  });

  it('visitorId e ipHash no salen en la respuesta', async () => {
    const { svc } = commentsSetup();
    expect(hasPrivate((await svc.create(1, guest, { message: 'hola' }))!)).toBe(false);
  });

  it('un comentario anónimo solo lo elimina un admin', async () => {
    const { svc, commentRepo } = commentsSetup();
    commentRepo.findOne.mockResolvedValue({ id: 5, userId: null });
    await expect(svc.remove(5, 7, false)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.remove(5, 1, true)).resolves.toMatchObject({ message: expect.any(String) });
  });

  it('un comentario anónimo no lo puede editar nadie', async () => {
    const { svc, commentRepo } = commentsSetup();
    commentRepo.findOne.mockResolvedValue({ id: 5, userId: null });
    await expect(svc.update(5, 7, { message: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ── Calificaciones ───────────────────────────────────────────────────────────
function ratingsSetup() {
  const rows: Record<string, unknown>[] = [];
  const matches = (r: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === 'object' && '_type' in (v as object) ? r[k] == null : r[k] === v,
    );
  const ratingRepo = {
    create: jest.fn((x) => x),
    findOne: jest.fn(async ({ where }) => rows.find((r) => matches(r, where)) ?? null),
    save: jest.fn(async (x) => {
      if (x.id) return x;
      const row = { id: rows.length + 1, ...x };
      rows.push(row);
      return row;
    }),
    manager: { findOne: jest.fn().mockResolvedValue({ id: 7, name: 'Ana' }) },
  };
  const propertyRepo = { findOne: jest.fn().mockResolvedValue({ id: 1, title: 'Casa' }) };
  const svc = new RatingsService(ratingRepo as never, propertyRepo as never, notif() as never);
  return { svc, rows };
}

describe('Calificaciones', () => {
  it('un visitante califica y, si vuelve a calificar, se actualiza (no se duplica)', async () => {
    const { svc, rows } = ratingsSetup();
    await svc.rateProperty(guest, 1, 4);
    await svc.rateProperty(guest, 1, 2);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ score: 2, userId: null, visitorId: VID });
  });

  it('un usuario logueado califica asociado a su cuenta', async () => {
    const { svc, rows } = ratingsSetup();
    await svc.rateProperty(logged, 1, 5);
    expect(rows[0]).toMatchObject({ userId: 7, visitorId: null });
  });

  it('sin sesión ni cookie de visitante → 400', async () => {
    const { svc } = ratingsSetup();
    await expect(svc.rateProperty({ ...guest, visitorId: null }, 1, 3)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fuera de 1..5 → 400', async () => {
    const { svc } = ratingsSetup();
    await expect(svc.rateProperty(guest, 1, 6)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.rateProperty(guest, 1, 0)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el admin sigue sin poder calificar', async () => {
    const { svc } = ratingsSetup();
    await expect(svc.rateProperty({ ...logged, role: Role.ADMIN }, 1, 3)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('la respuesta no expone visitorId ni ipHash', async () => {
    const { svc } = ratingsSetup();
    expect(hasPrivate(await svc.rateProperty(guest, 1, 3))).toBe(false);
  });
});

// ── "Me gusta" de publicaciones ──────────────────────────────────────────────
function likesSetup() {
  const likes: Record<string, unknown>[] = [];
  let likesCount = 0;
  const isNullOp = (v: unknown) => !!v && typeof v === 'object' && '_type' in (v as object);
  const likeRepo = {
    findOne: jest.fn(async ({ where }) =>
      likes.find((l) => Object.entries(where).every(([k, v]) => (isNullOp(v) ? l[k] == null : l[k] === v))) ?? null),
    delete: jest.fn(async ({ id }) => { likes.splice(likes.findIndex((l) => l.id === id), 1); likesCount--; }),
    insert: jest.fn(async (x) => {
      const dup = likes.some((l) => l.post_id === x.post_id &&
        (x.user_id ? l.user_id === x.user_id : l.user_id == null && l.visitor_id === x.visitor_id));
      if (dup) throw Object.assign(new Error('dup'), { code: '23505' });
      likes.push({ id: likes.length + 1, ...x });
      likesCount++;
    }),
  };
  const qbUpdate = { update: () => qbUpdate, set: () => qbUpdate, where: () => qbUpdate, execute: async () => undefined };
  const postRepoTx = { createQueryBuilder: () => qbUpdate, findOneBy: async () => ({ likesCount }) };
  const manager = { getRepository: (e: { name: string }) => (e.name === 'PostLike' ? likeRepo : postRepoTx) };
  const dataSource = { transaction: (fn: (m: unknown) => unknown) => fn(manager) };
  const postRepo = { findOneBy: jest.fn().mockResolvedValue({ id: 1 }), findOne: jest.fn().mockResolvedValue({ id: 1 }) };
  const svc = new PostsService(postRepo as never, {} as never, {} as never, {} as never, {} as never, dataSource as never, notif() as never);
  return { svc, likes, likeRepo };
}

describe('"Me gusta" de publicaciones', () => {
  it('un visitante da y quita "me gusta" (toggle)', async () => {
    const { svc, likes } = likesSetup();
    expect(await svc.toggleLike(1, guest)).toMatchObject({ liked: true });
    expect(likes[0]).toMatchObject({ user_id: null, visitor_id: VID });
    expect(await svc.toggleLike(1, guest)).toMatchObject({ liked: false });
    expect(likes).toHaveLength(0);
  });

  it('el mismo visitante no puede duplicar el "me gusta" (carrera contra el índice único)', async () => {
    const { svc, likes, likeRepo } = likesSetup();
    await svc.toggleLike(1, guest);
    // Simula dos requests simultáneos: el segundo no ve el like al consultar,
    // pero el INSERT choca contra el índice único (23505).
    likeRepo.findOne.mockResolvedValueOnce(null);
    const res = await svc.toggleLike(1, guest);
    expect(res).toMatchObject({ liked: true, likesCount: 1 }); // no se sumó otro
    expect(likes).toHaveLength(1);
  });

  it('un usuario logueado sigue asociado a su cuenta', async () => {
    const { svc, likes } = likesSetup();
    await svc.toggleLike(1, logged);
    expect(likes[0]).toMatchObject({ user_id: 7, visitor_id: null });
  });

  it('sin sesión ni cookie → 400', async () => {
    const { svc } = likesSetup();
    await expect(svc.toggleLike(1, { ...guest, visitorId: null })).rejects.toBeInstanceOf(BadRequestException);
  });
});
