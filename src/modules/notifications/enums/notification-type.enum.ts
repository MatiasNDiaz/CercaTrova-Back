/**
 * Tipo de notificación — qué la originó.
 *
 * ## Por qué existe
 *
 * Antes, la única forma de clasificar una notificación era mirar el texto de
 * `title`/`message` y buscar substrings en español ("Bajó el precio", "Solicitud
 * aceptada"…). Eso es frágil: cualquier corrección de redacción, un acento o un
 * emoji rompía la clasificación del frontend sin que nadie se enterara, y hacía
 * imposible traducir los textos. Con este campo, el texto queda libre para
 * cambiar y el frontend decide ícono, color y navegación por `type`.
 *
 * ## Convención
 *
 * Los valores `admin_*` corresponden 1 a 1 con notificaciones de gestión
 * (`targetRole: 'admin'`); el resto son del feed personal del usuario
 * (`targetRole: 'user'`). La relación entre `type` y `targetRole` es
 * redundante a propósito: `targetRole` decide EN QUÉ FEED aparece y `type`
 * decide CÓMO SE MUESTRA.
 *
 * La columna es `varchar` (no un enum de Postgres) para que agregar un tipo
 * nuevo no requiera un `ALTER TYPE` — mismo criterio que `targetRole`.
 */
export enum NotificationType {
  // ── Feed del usuario ────────────────────────────────────────────────
  /** Una propiedad nueva coincide con las preferencias guardadas del usuario. */
  PROPIEDAD_MATCH = 'propiedad_match',
  /** Se publicó una propiedad nueva (aviso general, sin matching). */
  NUEVA_PROPIEDAD = 'nueva_propiedad',
  /** Bajó el precio de una propiedad. */
  CAMBIO_PRECIO = 'cambio_precio',
  /** Se publicó algo nuevo en el feed de Publicaciones. */
  NUEVA_PUBLICACION = 'nueva_publicacion',
  /** Alguien respondió un comentario del usuario. */
  RESPUESTA_COMENTARIO = 'respuesta_comentario',
  /** Cambió el estado de una solicitud de publicación del usuario. */
  ESTADO_SOLICITUD = 'estado_solicitud',

  // ── Feed del admin (targetRole: 'admin') ────────────────────────────
  ADMIN_NUEVO_USUARIO = 'admin_nuevo_usuario',
  ADMIN_NUEVO_COMENTARIO = 'admin_nuevo_comentario',
  ADMIN_NUEVA_VALORACION = 'admin_nueva_valoracion',
  ADMIN_NUEVA_SOLICITUD = 'admin_nueva_solicitud',
  ADMIN_NUEVO_FAVORITO = 'admin_nuevo_favorito',
  ADMIN_COMENTARIO_PUBLICACION = 'admin_comentario_publicacion',

  /**
   * Fallback. No lo produce ningún generador actual: existe para que el
   * frontend siempre tenga un caso por defecto que renderizar y para las filas
   * viejas que el backfill no haya podido clasificar.
   */
  GENERICA = 'generica',
}
