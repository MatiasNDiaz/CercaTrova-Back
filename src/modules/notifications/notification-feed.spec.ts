// Notificaciones con la foto de la propiedad (Parte 2).
import { NotificationService } from './notifications.service';
import { toFeedItem, type FeedRow } from './notification-feed';
import { Notification } from './entities/notification.entity';
import { NotificationType } from './enums/notification-type.enum';
import { StatusProperty } from '../properties/dto/enumsStatusProperty';

const base = (over: Partial<Notification> = {}): Notification =>
  ({
    id: 7,
    title: 'Nuevo comentario en propiedad',
    message: 'Ana comentó…',
    propertyId: 42,
    read: false,
    targetRole: 'admin',
    type: NotificationType.ADMIN_NUEVO_COMENTARIO,
    relatedUserId: null,
    commentId: 123,
    ratingId: null,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    user: { id: 1 },
    ...over,
  }) as unknown as Notification;

const row = (over: Partial<FeedRow> = {}): FeedRow => ({
  n_id: 7,
  feed_property_id: 42,
  feed_property_title: 'Casa en Villa Belgrano',
  feed_property_status: StatusProperty.DISPONIBLE,
  feed_property_image:
    'https://res.cloudinary.com/x/image/upload/v1/portada.jpg',
  ...over,
});

describe('toFeedItem — datos de la propiedad para la miniatura', () => {
  it('propiedad disponible con portada', () => {
    const item = toFeedItem(base(), row());
    expect(item).toMatchObject({
      propertyId: 42,
      propertyTitle: 'Casa en Villa Belgrano',
      propertyImage: 'https://res.cloudinary.com/x/image/upload/v1/portada.jpg',
      propertyAvailable: true,
      commentId: 123,
    });
    expect('user' in item).toBe(false);
  });

  it('propiedad sin fotos → disponible, sin imagen (placeholder)', () => {
    const item = toFeedItem(base(), row({ feed_property_image: null }));
    expect(item.propertyAvailable).toBe(true);
    expect(item.propertyImage).toBeNull();
  });

  it('propiedad borrada (el join no la encuentra) → no disponible', () => {
    const item = toFeedItem(
      base(),
      row({
        feed_property_id: null,
        feed_property_title: null,
        feed_property_status: null,
        feed_property_image: null,
      }),
    );
    expect(item.propertyAvailable).toBe(false);
    expect(item.propertyTitle).toBeNull();
    expect(item.propertyImage).toBeNull();
  });

  it('propiedad dada de baja ("eliminado") → no disponible y sin foto', () => {
    const item = toFeedItem(
      base(),
      row({ feed_property_status: StatusProperty.ELIMINADO }),
    );
    expect(item.propertyAvailable).toBe(false);
    expect(item.propertyImage).toBeNull();
    expect(item.propertyTitle).toBe('Casa en Villa Belgrano');
  });

  it('notificación sin propiedad (nuevo usuario) → campos de propiedad en null', () => {
    const item = toFeedItem(
      base({ propertyId: null as unknown as number, commentId: null }),
      undefined,
    );
    expect(item).toMatchObject({
      propertyTitle: null,
      propertyImage: null,
      propertyAvailable: null,
    });
  });

  it('notificación vieja (sin commentId) igual resuelve la foto por propertyId', () => {
    const item = toFeedItem(base({ commentId: null }), row());
    expect(item.commentId).toBeNull();
    expect(item.propertyImage).not.toBeNull();
  });
});

describe('NotificationService — guarda el comentario / la valoración puntual', () => {
  const created: Partial<Notification>[] = [];
  const repo = {
    create: jest.fn((x: Partial<Notification>) => (created.push(x), x)),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
  };
  const usersService = {
    getAdminUsers: jest
      .fn()
      .mockResolvedValue([{ id: 1, email: 'admin@x.com' }]),
  };
  const emailService = {
    sendMultipleEmails: jest.fn().mockResolvedValue(undefined),
  };
  const service = new NotificationService(
    repo as never,
    usersService as never,
    {} as never,
    emailService as never,
  );

  beforeEach(() => (created.length = 0));

  it('comentario → commentId', async () => {
    await service.notifyAdminNewComment({
      userName: 'Ana',
      propertyTitle: 'Casa',
      propertyId: 42,
      commentPreview: 'Hola',
      relatedUserId: null,
      commentId: 123,
    });
    expect(created[0]).toMatchObject({
      propertyId: 42,
      commentId: 123,
      ratingId: null,
      targetRole: 'admin',
    });
  });

  it('valoración → ratingId', async () => {
    await service.notifyAdminNewRating({
      userName: 'Ana',
      propertyTitle: 'Casa',
      propertyId: 42,
      score: 5,
      relatedUserId: null,
      ratingId: 9,
    });
    expect(created[0]).toMatchObject({
      propertyId: 42,
      ratingId: 9,
      commentId: null,
    });
  });

  it('favorito → sin comentario ni valoración (lleva al inicio del detalle)', async () => {
    await service.notifyAdminNewFavorite({
      userName: 'Ana',
      propertyTitle: 'Casa',
      propertyId: 42,
      relatedUserId: 3,
    });
    expect(created[0]).toMatchObject({
      propertyId: 42,
      commentId: null,
      ratingId: null,
    });
  });
});
