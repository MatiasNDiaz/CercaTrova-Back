// Tests de la galería de publicaciones (imágenes + videos). Blindan las reglas
// que impiden asociar archivos ajenos, dejar huérfanos o pasarse de límites.
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { resolveMediaLayout, collectPostFiles } from './post-media.helper';
import {
  CreatePostDto,
  PostMediaSlotDto,
  PostMediaSlotKind as K,
  UpdatePostDto,
} from './dto/create-post.dto';
import { PostMediaType as T } from './entities/post-media.entity';
import { POST_MEDIA_LIMITS } from './post-media.constants';

const img = (index: number): PostMediaSlotDto => ({ kind: K.IMAGE, index });
const vid = (publicId: string): PostMediaSlotDto => ({
  kind: K.VIDEO,
  publicId,
});
const old = (id: number): PostMediaSlotDto => ({ kind: K.EXISTING, id });

describe('resolveMediaLayout', () => {
  it('acepta solo imágenes, en el orden pedido', () => {
    const r = resolveMediaLayout([img(1), img(0)], 2);
    expect(r.slots).toEqual([img(1), img(0)]);
    expect(r.newVideoPublicIds).toEqual([]);
  });

  it('acepta solo videos', () => {
    const r = resolveMediaLayout([vid('posts/videos/a')], 0);
    expect(r.newVideoPublicIds).toEqual(['posts/videos/a']);
  });

  it('acepta imágenes y videos mezclados', () => {
    const r = resolveMediaLayout(
      [vid('posts/videos/a'), img(0), vid('posts/videos/b')],
      1,
    );
    expect(r.slots.map((s) => s.kind)).toEqual([K.VIDEO, K.IMAGE, K.VIDEO]);
  });

  it('rechaza una galería vacía', () => {
    expect(() => resolveMediaLayout([], 0)).toThrow(BadRequestException);
  });

  it('rechaza más medios que el máximo', () => {
    const n = POST_MEDIA_LIMITS.maxMediaPerPost + 1;
    const slots = Array.from({ length: n }, (_, i) => img(i));
    expect(() => resolveMediaLayout(slots, n)).toThrow(/admite hasta/);
  });

  it('rechaza más videos que el máximo (contando los que ya tenía)', () => {
    const existing = new Map([
      [1, T.VIDEO],
      [2, T.VIDEO],
      [3, T.VIDEO],
    ]);
    expect(() =>
      resolveMediaLayout(
        [old(1), old(2), old(3), vid('posts/videos/x')],
        0,
        existing,
      ),
    ).toThrow(/videos/);
  });

  it('rechaza una referencia a una imagen no adjunta', () => {
    expect(() => resolveMediaLayout([img(3)], 1)).toThrow(/no se adjuntó/);
  });

  it('rechaza un adjunto que no figura en la galería (sería un huérfano)', () => {
    expect(() => resolveMediaLayout([img(0)], 2)).toThrow(/no figuran/);
  });

  it('rechaza una imagen repetida', () => {
    expect(() => resolveMediaLayout([img(0), img(0)], 1)).toThrow(/repite/);
  });

  it('rechaza un video repetido', () => {
    expect(() =>
      resolveMediaLayout([vid('posts/videos/a'), vid('posts/videos/a')], 0),
    ).toThrow(/repite/);
  });

  it('rechaza un medio de OTRA publicación', () => {
    const existing = new Map([[10, T.IMAGE]]);
    expect(() => resolveMediaLayout([old(99)], 0, existing)).toThrow(
      /no pertenece/,
    );
  });

  it('al editar, lo que no figura se marca para eliminar — y nada más', () => {
    const existing = new Map([
      [10, T.IMAGE],
      [11, T.VIDEO],
      [12, T.IMAGE],
    ]);
    const r = resolveMediaLayout([old(12), old(10)], 0, existing);
    expect(r.removedIds).toEqual([11]);
    expect(r.slots).toEqual([old(12), old(10)]);
  });
});

describe('collectPostFiles', () => {
  it('no duplica la imagen legada que la migración copió a media', () => {
    const files = collectPostFiles({
      imagePublicId: 'posts/abc',
      media: [
        { publicId: 'posts/abc', type: T.IMAGE },
        { publicId: 'posts/videos/v', type: T.VIDEO },
      ],
    });
    expect(files).toEqual([
      { publicId: 'posts/abc', type: T.IMAGE },
      { publicId: 'posts/videos/v', type: T.VIDEO },
    ]);
  });

  it('incluye la imagen legada si no está entre los medios', () => {
    expect(collectPostFiles({ imagePublicId: 'posts/old', media: [] })).toEqual(
      [{ publicId: 'posts/old', type: T.IMAGE }],
    );
  });
});

describe('DTOs de publicación (mismas reglas que aplica JsonToDtoPipe)', () => {
  const check = async (cls: new () => object, plain: unknown) =>
    validate(plainToInstance(cls, plain), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('el formulario viejo (solo descripción) sigue siendo válido', async () => {
    expect(await check(CreatePostDto, { description: 'Hola' })).toHaveLength(0);
  });

  it('rechaza un publicId con caracteres peligrosos', async () => {
    const errors = await check(CreatePostDto, {
      description: 'Hola',
      media: [{ kind: 'video', publicId: '../../properties/x' }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rechaza un tipo de medio desconocido', async () => {
    const errors = await check(CreatePostDto, {
      description: 'Hola',
      media: [{ kind: 'audio' }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('la edición exige la galería final', async () => {
    expect(
      (await check(UpdatePostDto, { description: 'x' })).length,
    ).toBeGreaterThan(0);
    expect(
      await check(UpdatePostDto, { media: [{ kind: 'existing', id: 3 }] }),
    ).toHaveLength(0);
  });
});
