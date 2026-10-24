import { StatusProperty } from '../properties/dto/enumsStatusProperty';
import { Notification } from './entities/notification.entity';

/** Columnas extra que agrega la consulta del feed (ver `NotificationService.feed`). */
export interface FeedRow {
  n_id: number | string;
  feed_property_id: number | null;
  feed_property_title: string | null;
  feed_property_status: StatusProperty | null;
  feed_property_image: string | null;
}

/**
 * Una notificación tal como la recibe el panel: la fila de siempre más los
 * datos de la propiedad para la miniatura. Los campos `property*` solo tienen
 * sentido cuando `propertyId` no es null.
 */
export type NotificationFeedItem = Omit<Notification, 'user'> & {
  /** Título actual de la propiedad (para el `alt` y el `aria-label`). */
  propertyTitle: string | null;
  /** URL de la portada (o de la primera foto). null = la propiedad no tiene fotos. */
  propertyImage: string | null;
  /**
   * false = la propiedad fue borrada o está dada de baja ("eliminado"): el
   * panel muestra "Propiedad no disponible" y no la enlaza.
   * null = la notificación no apunta a ninguna propiedad.
   */
  propertyAvailable: boolean | null;
};

export function toFeedItem(
  n: Notification,
  row: FeedRow | undefined,
): NotificationFeedItem {
  // `user` no se carga en el feed; se descarta para no mandar `undefined`.
  const { user: _user, ...rest } = n;
  void _user;

  if (n.propertyId == null) {
    return {
      ...rest,
      propertyTitle: null,
      propertyImage: null,
      propertyAvailable: null,
    };
  }

  const exists = row?.feed_property_id != null;
  const available =
    exists && row.feed_property_status !== StatusProperty.ELIMINADO;
  return {
    ...rest,
    propertyTitle: exists ? (row.feed_property_title ?? null) : null,
    propertyImage: available ? (row.feed_property_image ?? null) : null,
    propertyAvailable: available,
  };
}
