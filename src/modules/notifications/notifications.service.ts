import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { UsersService } from '../users/users.service';
import { Role } from '../users/enums/role.enum';
import { SearchPreferencesService } from '../search-preferences/search-preferences.service';
import { Property } from '../properties/entities/property.entity';
import { EmailService } from './email/email.service';
import { EmailTemplates } from './email/email-template';
import { PropertyRequest, RequestStatus } from '../PropertyRequest/entities/PropertyRequest';
import { NotificationType } from './enums/notification-type.enum';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    private readonly usersService: UsersService,
    private readonly searchPrefService: SearchPreferencesService,
    private readonly emailService: EmailService,
  ) {}

  // -----------------------------------------------------
  // HELPERS DE MATCHING CON MÁRGENES
  // -----------------------------------------------------
  private priceMatches(propertyPrice: number, preferredPrice?: number): boolean {
    if (!preferredPrice || !propertyPrice) return false;
    return propertyPrice <= preferredPrice;
  }

  // Compara una superficie de la propiedad (total o cubierta) contra la
  // preferida por el usuario, con el mismo margen de siempre (-15% / +30%)
  private surfaceMatches(propSurface: number, prefSurface: number): boolean {
    if (!prefSurface || !propSurface) return false;
    return propSurface >= prefSurface * 0.85 && propSurface <= prefSurface * 1.30;
  }

  private antiquityMatches(propAnt: number, prefMaxAnt: number): boolean {
    if (prefMaxAnt === null || prefMaxAnt === undefined) return true;
    return Number(propAnt) <= (Number(prefMaxAnt) + 2);
  }

  /**
   * Ficha técnica que se muestra en la tarjeta de los emails de propiedad.
   * Se descartan los campos vacíos para que no queden filas con "undefined".
   */
  private propertySpecs(property: Property): { label: string; value: string | number }[] {
    return [
      { label: 'Tipo',          value: property.typeOfProperty?.name ?? '' },
      { label: 'Ambientes',     value: property.rooms ?? '' },
      { label: 'Baños',         value: property.bathrooms ?? '' },
      { label: 'Sup. Total',    value: property.supTotal != null ? `${property.supTotal} m²` : '' },
      { label: 'Sup. Cubierta', value: property.supCubierta != null ? `${property.supCubierta} m²` : '' },
      { label: 'Antigüedad',    value: property.antiquity != null ? `${property.antiquity} años` : '' },
    ].filter((s) => s.value !== '' && s.value !== null && s.value !== undefined);
  }

  // -----------------------------------------------------
  // 1. NUEVA PROPIEDAD — matching + broadcast global
  // -----------------------------------------------------
  async handleNewProperty(property: Property) {
    const prefs = await this.searchPrefService.findAllWithUsers();
    const imageUrls = property.images?.map((i) => i.url) ?? [];
    const notifiedUserIds = new Set<number>();

    // Se juntan todos los matches primero y recién después se guarda y se
    // envía, para no hacer una query y un email por vuelta del for.
    const coincidencias: {
      pref: (typeof prefs)[number];
      matched: string[];
      totalCriteria: number;
    }[] = [];

    for (const pref of prefs) {
      if (!pref.notifyNewMatches || !pref.user?.email) continue;

      const prefTypeId = pref.typeOfProperty?.id ? Number(pref.typeOfProperty.id) : null;
      const propTypeId = property.typeOfProperty?.id ? Number(property.typeOfProperty.id) : null;

      if (prefTypeId && prefTypeId !== propTypeId) continue;
      if (pref.operationType && pref.operationType !== property.operationType) continue;

      const criteriaToCheck = [
        pref.zone, pref.typeOfProperty, pref.preferredPrice,
        pref.minRooms, pref.minBathrooms, pref.supTotal, pref.supCubierta,
        pref.operationType, pref.maxAntiquity, pref.property_deed,
        pref.tractoAbreviado, pref.boleto, pref.barrio, pref.localidad,
        pref.garage, pref.patio,
      ];
      const totalCriteria = criteriaToCheck.filter(
        (v) => v !== null && v !== undefined && v !== false
      ).length;

      const matched: string[] = [];

      if (pref.zone && property.zone?.toLowerCase().includes(pref.zone.toLowerCase()))
        matched.push(`Zona: ${pref.zone}`);
      if (pref.localidad && property.localidad?.trim().toLowerCase() === pref.localidad.toLowerCase())
        matched.push(`Localidad: ${pref.localidad}`);
      if (pref.barrio && property.barrio?.trim().toLowerCase() === pref.barrio.toLowerCase())
        matched.push(`Barrio: ${pref.barrio}`);
      if (pref.operationType && pref.operationType === property.operationType)
        matched.push(`Operación: ${property.operationType}`);
      if (prefTypeId && prefTypeId === propTypeId)
        matched.push(`Tipo: ${property.typeOfProperty?.name || 'Inmueble'}`);
      if (pref.preferredPrice && this.priceMatches(property.price, pref.preferredPrice)) {
        const diff = property.price - pref.preferredPrice;
        matched.push(`Precio: $${property.price} (${diff > 0 ? '+' : ''}${diff} vs tu búsqueda)`);
      }
      if (pref.minRooms && (property.rooms ?? 0) >= pref.minRooms)
        matched.push(`Habitaciones: ${property.rooms} (mínimo ${pref.minRooms})`);
      if (pref.minBathrooms && (property.bathrooms ?? 0) >= pref.minBathrooms)
        matched.push(`Baños: ${property.bathrooms}`);
      if (pref.supTotal && this.surfaceMatches(property.supTotal, pref.supTotal))
        matched.push(`Sup. Total: ${property.supTotal} m² (acorde a tu búsqueda)`);
      if (pref.supCubierta && this.surfaceMatches(property.supCubierta, pref.supCubierta))
        matched.push(`Sup. Cubierta: ${property.supCubierta} m² (acorde a tu búsqueda)`);
      if (pref.property_deed === true && property.property_deed === true)
        matched.push('Tiene escrituras');
      if (pref.tractoAbreviado === true && property.tractoAbreviado === true)
        matched.push('Tiene tracto abreviado');
      if (pref.boleto === true && property.boleto === true)
        matched.push('Tiene boleto');
      if (pref.maxAntiquity !== undefined && pref.maxAntiquity !== null)
        if (this.antiquityMatches(Number(property.antiquity), Number(pref.maxAntiquity)))
          matched.push(`Antigüedad: ${property.antiquity} años`);
      if (pref.garage === true && property.garage === true)
        matched.push('Tiene garage');
      if (pref.patio === true && property.patio === true)
        matched.push('Tiene patio');

      if (matched.length === 0) continue;

      notifiedUserIds.add(pref.user.id);
      // Se acumula en vez de guardar/enviar acá adentro: ver nota de abajo.
      coincidencias.push({ pref, matched, totalCriteria });
    }

    // ── Un solo INSERT para todas las notificaciones ──
    // Antes se hacía `await repo.save(...)` DENTRO del for: con 100 usuarios
    // que matcheaban eran 100 INSERTs secuenciales.
    if (coincidencias.length > 0) {
      await this.repo.save(
        coincidencias.map(({ pref, matched, totalCriteria }) =>
          this.repo.create({
            user: pref.user,
            type: NotificationType.PROPIEDAD_MATCH,
            title: '¡Propiedad que te puede interesar!',
            message: `Encontramos una propiedad que cumple ${matched.length} de tus ${totalCriteria} criterios de búsqueda.`,
            propertyId: property.id,
          }),
        ),
      );

      // ── Emails en paralelo, de a tandas ──
      // Cada usuario recibe un cuerpo DISTINTO (lleva sus propios criterios
      // matcheados), así que no se puede usar el batch de SendGrid, que solo
      // permite variar los destinatarios y no el HTML. Lo que sí se puede es
      // dejar de mandarlos de a uno esperando cada respuesta: antes, con 100
      // usuarios y ~300ms por request, el aviso tardaba 30 segundos en salir.
      // El tope de concurrencia evita abrir 100 conexiones de golpe.
      const CONCURRENCIA = 10;
      for (let i = 0; i < coincidencias.length; i += CONCURRENCIA) {
        await Promise.allSettled(
          coincidencias.slice(i, i + CONCURRENCIA).map(({ pref, matched, totalCriteria }) =>
            this.emailService
              .sendEmail(
                pref.user.email,
                'Nueva propiedad según tus preferencias',
                EmailTemplates.matchSearch(
                  pref.user.name || 'Usuario',
                  property.title,
                  `${property.barrio}, ${property.localidad}`,
                  property.price,
                  imageUrls,
                  matched,
                  matched.length,
                  totalCriteria,
                  property.operationType,
                  this.propertySpecs(property),
                  property.description,
                  property.id,
                ),
              )
              .catch(() =>
                console.error(`[ERROR MAIL] No se pudo enviar a ${pref.user.email}`),
              ),
          ),
        );
      }
    }

    await this.broadcastNewProperty(property, notifiedUserIds).catch((err) =>
      console.error('Error en broadcast global:', err),
    );
  }

  // -----------------------------------------------------
  // 2. BROADCAST GLOBAL
  // -----------------------------------------------------
  async broadcastNewProperty(property: Property, excludedIds: Set<number> = new Set()) {
    const allUsers = await this.usersService.getAllUsers();
    const imageUrls = property.images?.map((i) => i.url) ?? [];

    const usersToNotify = allUsers.filter((u) => u.email && !excludedIds.has(u.id));
    if (usersToNotify.length === 0) return;

    await this.repo.save(
      usersToNotify.map((user) =>
        this.repo.create({
          user,
          type: NotificationType.NUEVA_PROPIEDAD,
          title: 'Nueva propiedad publicada',
          message: `Se publicó: "${property.title}" en ${property.barrio}, ${property.localidad}.`,
          propertyId: property.id,
        }),
      ),
    );

    // 📧 (M8): el email masivo respeta el opt-out notifyBroadcast;
    // la notificación in-app (campanita) se guarda igual para todos
    const emailRecipients = usersToNotify.filter((u) => u.notifyBroadcast !== false);
    if (emailRecipients.length === 0) return;

    try {
      await this.emailService.sendMultipleEmails(
        emailRecipients.map((u) => u.email),
        'Nueva propiedad publicada en CercaTrova',
        EmailTemplates.newProperty(
          property.title,
          `${property.barrio || ''}, ${property.localidad || ''}`,
          property.price,
          imageUrls,
          property.operationType,
          this.propertySpecs(property),
          property.description,
          property.id,
        ),
      );
    } catch {
      console.error('[ERROR MAIL GLOBAL] Falló el envío masivo.');
    }
  }

  // -----------------------------------------------------
  // 3. BAJA DE PRECIO
  // -----------------------------------------------------
  async handlePriceChange(property: Property, oldPrice: number) {
    if ((property.price ?? 0) >= oldPrice) return;

    const allUsers = await this.usersService.getAllUsers();
    const imageUrls = property.images?.map((i) => i.url) ?? [];

    const prefs = await this.searchPrefService.findAllWithUsers();
    const prefsByUserId = new Map(prefs.map((p) => [p.user?.id, p]));

    const usersToNotify = allUsers.filter((u) => {
      if (!u.email) return false;
      const pref = prefsByUserId.get(u.id);
      return !pref || pref.notifyPriceDrops !== false;
    });

    if (usersToNotify.length === 0) return;

    await this.repo.save(
      usersToNotify.map((user) =>
        this.repo.create({
          user,
          type: NotificationType.CAMBIO_PRECIO,
          title: '¡Bajó el precio!',
          message: `"${property.title}" bajó de $${oldPrice.toLocaleString()} a $${property.price.toLocaleString()}.`,
          propertyId: property.id,
        }),
      ),
    );

    // 📧 (M8): el email masivo respeta el opt-out notifyBroadcast;
    // la notificación in-app (campanita) se guarda igual para todos
    const emailRecipients = usersToNotify.filter((u) => u.notifyBroadcast !== false);
    if (emailRecipients.length === 0) return;

    try {
      await this.emailService.sendMultipleEmails(
        emailRecipients.map((u) => u.email),
        '¡Bajó el precio de una propiedad!',
        EmailTemplates.priceDrop(property.title, property.zone, oldPrice, property.price, imageUrls),
      );
    } catch {
      console.error('[ERROR MAIL PRICE] Falló el envío de baja de precio.');
    }
  }

  // -----------------------------------------------------
  // 3.b NUEVA PUBLICACIÓN (feed de Publicaciones)
  // -----------------------------------------------------
  /**
   * Avisa a todos los usuarios que se publicó algo nuevo en el feed.
   *
   * Recibe datos planos y NO la entidad `Post` a propósito: así
   * `NotificationModule` no necesita depender de `PostsModule` (que a su vez
   * depende de este) y no se arma un ciclo de imports.
   */
  async handleNewPost(post: { id: number; description: string; imageUrl?: string }) {
    const allUsers = await this.usersService.getAllUsers();
    const usersToNotify = allUsers.filter((u) => u.email);
    if (usersToNotify.length === 0) return;

    const preview =
      post.description.length > 100
        ? `${post.description.slice(0, 100)}…`
        : post.description;

    await this.repo.save(
      usersToNotify.map((user) =>
        this.repo.create({
          user,
          type: NotificationType.NUEVA_PUBLICACION,
          title: 'Nueva publicación',
          message: `Publicamos algo nuevo: "${preview}"`,
        }),
      ),
    );

    // 📧 (M8): el email masivo respeta el opt-out notifyBroadcast;
    // la notificación in-app se guarda igual para todos.
    const emailRecipients = usersToNotify
      .filter((u) => u.notifyBroadcast !== false)
      .map((u) => u.email);
    if (emailRecipients.length === 0) return;

    await this.emailService
      .sendMultipleEmails(
        emailRecipients,
        'Nueva publicación en CercaTrova',
        EmailTemplates.newPost(preview, post.imageUrl),
      )
      .catch((err) => console.error('[MAIL POST] Falló el aviso de publicación:', err));
  }

  // -----------------------------------------------------
  // 3.c RESPUESTA A UN COMENTARIO (Publicaciones)
  // -----------------------------------------------------
  /**
   * Avisa al autor del comentario que alguien le respondió.
   * No hace nada si el usuario se responde a sí mismo.
   */
  async notifyCommentReply(data: {
    commentOwnerId: number;
    responderName: string;
    responderIsAdmin: boolean;
    replyPreview: string;
    postId: number;
  }) {
    const owner = await this.usersService.getUserById(data.commentOwnerId);
    if (!owner) return;

    const preview =
      data.replyPreview.length > 120
        ? `${data.replyPreview.slice(0, 120)}…`
        : data.replyPreview;

    const quien = data.responderIsAdmin ? 'El equipo de CercaTrova' : data.responderName;
    const title = 'Respondieron tu comentario';
    const message = `${quien} respondió a tu comentario: "${preview}"`;

    await this.repo.save(
      this.repo.create({
        user: owner,
        type: NotificationType.RESPUESTA_COMENTARIO,
        title,
        message,
        propertyId: null,
      }),
    );

    if (!owner.email) return;

    this.emailService
      .sendEmail(owner.email, title, EmailTemplates.commentReply(owner.name || 'Usuario', quien, preview))
      .catch(() => console.error(`[MAIL REPLY] No se pudo avisar a ${owner.email}`));
  }

  // -----------------------------------------------------
  // 4. CAMBIO DE ESTADO DE SOLICITUD
  // -----------------------------------------------------
  async handleRequestStatusChange(request: PropertyRequest) {
    if (!request.user?.email) return;

    const statusMessages: Record<RequestStatus, { title: string; message: string }> = {
      [RequestStatus.ENVIADO]:   { title: 'Solicitud recibida',       message: `Tu solicitud para "${request.direccion}, ${request.barrio}" fue recibida correctamente.` },
      [RequestStatus.REVISION]:  { title: 'Solicitud en revisión',    message: `Un agente está revisando tu solicitud para "${request.direccion}, ${request.barrio}".` },
      [RequestStatus.ACEPTADO]:  { title: '¡Solicitud aceptada! 🎉',  message: `Tu solicitud para "${request.direccion}, ${request.barrio}" fue aceptada. Un agente se contactará pronto.` },
      [RequestStatus.RECHAZADO]: { title: 'Solicitud rechazada',      message: `Tu solicitud para "${request.direccion}, ${request.barrio}" no pudo ser procesada en este momento.` },
    };

    const { title, message } = statusMessages[request.status] ?? {
      title: 'Actualización de solicitud',
      message: `El estado de tu solicitud fue actualizado a: ${request.status}.`,
    };

    await this.repo.save(this.repo.create({
      user: request.user,
      type: NotificationType.ESTADO_SOLICITUD,
      title,
      message,
    }));

    try {
      await this.emailService.sendEmail(
        request.user.email,
        title,
        EmailTemplates.requestStatusChange(
          request.user.name || 'Usuario',
          request.direccion,
          request.barrio,
          request.localidad,
          request.status,
          title,
          message,
        ),
      );
    } catch {
      console.error(`[ERROR MAIL REQUEST] No se pudo notificar a ${request.user.email}`);
    }
  }

  // -----------------------------------------------------
  // GET para el usuario
  // -----------------------------------------------------
  /**
   * ⚠️ Excluye las notificaciones con `targetRole = 'admin'`.
   *
   * `createAdminNotification` las guarda con `user = <cada admin>` Y
   * `targetRole = 'admin'`, así que filtrando solo por `user.id` un admin las
   * recibía por los DOS endpoints: aparecían en `/notifications` (su feed
   * personal) y otra vez en `/notifications/admin`. En datos reales eso daba 82
   * contra 63 — la campanita y el panel contaban de más.
   *
   * Los dos feeds ahora son disjuntos: acá van solo las notificaciones
   * personales (nueva propiedad, baja de precio, respuesta a un comentario…) y
   * en `getForAdmin` solo las de gestión.
   */
  async getForUser(userId: number) {
    return this.repo.find({
      where: { user: { id: userId }, targetRole: 'user' },
      order: { createdAt: 'DESC' },
    });
  }

  // -----------------------------------------------------
  // CONTEO DE NO LEÍDAS
  // -----------------------------------------------------
  /**
   * Solo el número, para la campanita.
   *
   * Antes el front pedía la lista COMPLETA cada 60 segundos y contaba en JS los
   * no leídos: con 82 notificaciones eso son 82 filas con su relación de
   * usuario viajando por la red para mostrar un número. Acá lo resuelve un
   * `COUNT(*)` en la base.
   */
  async countUnread(userId: number, role: Role): Promise<{ count: number }> {
    const count =
      role === Role.ADMIN
        ? await this.repo.count({ where: { targetRole: 'admin', read: false } })
        : await this.repo.count({
            where: { user: { id: userId }, targetRole: 'user', read: false },
          });

    return { count };
  }

  // -----------------------------------------------------
  // MARCAR COMO LEÍDA
  // -----------------------------------------------------
  // 🔒 SEGURIDAD (M6): solo el dueño puede marcar su notificación como leída.
  // El admin puede además marcar las notificaciones dirigidas a admins
  // (targetRole = 'admin'), que no tienen un usuario dueño.
  async markAsRead(notificationId: number, userId: number, role: Role) {
    const qb = this.repo
      .createQueryBuilder()
      .update()
      .set({ read: true })
      .where('id = :id', { id: notificationId });

    if (role === Role.ADMIN) {
      qb.andWhere('("userId" = :userId OR "targetRole" = \'admin\')', { userId });
    } else {
      qb.andWhere('"userId" = :userId', { userId });
    }

    const result = await qb.execute();
    if (!result.affected) {
      throw new NotFoundException('Notificación no encontrada');
    }
    return { message: 'Notificación marcada como leída' };
  }

  // -----------------------------------------------------
  // MARCAR TODAS COMO LEÍDAS (usuario)
  // -----------------------------------------------------
  async markAllAsRead(userId: number) {
    await this.repo
      .createQueryBuilder()
      .update()
      .set({ read: true })
      .where('userId = :userId AND read = false', { userId })
      .execute();
    return { message: 'Todas las notificaciones marcadas como leídas' };
  }

  // -----------------------------------------------------
  // HELPER PRIVADO ADMIN — ahora con relatedUserId 👈
  // -----------------------------------------------------
  // `type` va PRIMERO y es obligatorio a propósito: al agregarlo como
  // parámetro requerido, el compilador obliga a clasificar cualquier
  // notificación de admin nueva en vez de dejarla caer en el fallback.
  private async createAdminNotification(
    type: NotificationType,
    title: string,
    message: string,
    propertyId?: number,
    relatedUserId?: number, // 👈
    emoji = '🔔',
  ) {
    const admins = await this.usersService.getAdminUsers();
    if (!admins.length) return;

    await this.repo.save(
      admins.map((admin) =>
        this.repo.create({
          user: admin,
          type,
          title,
          message,
          propertyId: propertyId ?? null,
          relatedUserId: relatedUserId ?? null, // 👈
          targetRole: 'admin',
        }),
      ),
    );

    // 📧 Además de la notificación in-app (campanita), el mismo aviso va por
    // email a los admins. No bloquea: si el envío falla, la notificación
    // in-app ya quedó guardada y el fallo se registra en `failed_emails`.
    const recipients = admins.map((a) => a.email).filter(Boolean);
    if (recipients.length === 0) return;

    this.emailService
      .sendMultipleEmails(recipients, title, EmailTemplates.adminAlert(title, message, emoji))
      .catch((err) => console.error('[MAIL ADMIN] Falló el aviso por email:', err));
  }

  // -----------------------------------------------------
  // ADMIN 1. NUEVO USUARIO — ahora recibe id 👈
  // -----------------------------------------------------
  async notifyAdminNewUser(newUser: { id: number; name: string; email: string }) {
    await this.createAdminNotification(
      NotificationType.ADMIN_NUEVO_USUARIO,
      'Nuevo usuario registrado',
      `${newUser.name} (${newUser.email}) se registró en la plataforma.`,
      null,
      newUser.id, // 👈
      
      '👤',
    );
  }

  // -----------------------------------------------------
  // ADMIN 2. NUEVO COMENTARIO
  // -----------------------------------------------------
  async notifyAdminNewComment(data: {
    userName: string;
    propertyTitle: string;
    propertyId: number;
    commentPreview: string;
     relatedUserId: number; // 👈 agregar
  }) {
    await this.createAdminNotification(
      NotificationType.ADMIN_NUEVO_COMENTARIO,
      'Nuevo comentario en propiedad',
      `${data.userName} comentó en "${data.propertyTitle}": "${data.commentPreview.slice(0, 80)}${data.commentPreview.length > 80 ? '...' : ''}"`,
      data.propertyId,
         data.relatedUserId, // 👈
         '💬',
    );
  }

  // -----------------------------------------------------
  // ADMIN 3. NUEVA VALORACIÓN
  // -----------------------------------------------------
  async notifyAdminNewRating(data: {
    userName: string;
    propertyTitle: string;
    propertyId: number;
    score: number;
     relatedUserId: number; // 👈 agregar
  }) {
    await this.createAdminNotification(
      NotificationType.ADMIN_NUEVA_VALORACION,
      'Nueva valoración en propiedad',
      `${data.userName} valoró "${data.propertyTitle}" con ${data.score} estrella${data.score !== 1 ? 's' : ''}.`,
      data.propertyId,
         data.relatedUserId, // 👈
         '⭐',
    );
  }

  // -----------------------------------------------------
  // ADMIN 4. SOLICITUD DE PUBLICACIÓN
  // -----------------------------------------------------
  async notifyAdminNewPropertyRequest(data: {
    userName: string;
    direccion: string;
    barrio: string;
    localidad: string;
     relatedUserId: number; // 👈 agregar
  }) {
    await this.createAdminNotification(
      NotificationType.ADMIN_NUEVA_SOLICITUD,
      'Nueva solicitud de publicación',
      `${data.userName} solicitó publicar una propiedad en ${data.direccion}, ${data.barrio}, ${data.localidad}.`,
      null,
      data.relatedUserId, // 👈
      '📄',
    );
  }

  // -----------------------------------------------------
  // ADMIN 5. FAVORITO
  // -----------------------------------------------------
  async notifyAdminNewFavorite(data: {
    userName: string;
    propertyTitle: string;
    propertyId: number;
     relatedUserId: number; // 👈 agregar
  }) {
    await this.createAdminNotification(
      NotificationType.ADMIN_NUEVO_FAVORITO,
      'Propiedad guardada en favoritos',
      `${data.userName} guardó "${data.propertyTitle}" en sus favoritos.`,
      data.propertyId,
         data.relatedUserId, // 👈
         '❤️',
    );
  }

  // -----------------------------------------------------
  // ADMIN 6. COMENTARIO EN UNA PUBLICACIÓN
  // -----------------------------------------------------
  /**
   * Las publicaciones las crea el admin, así que un comentario en una de ellas
   * es un aviso para él ("Matías comentó tu publicación sobre…").
   *
   * Faltaba por completo: `posts.service.createComment()` guardaba el comentario
   * y no avisaba a nadie. Solo estaba cubierta la RESPUESTA a un comentario
   * (`notifyCommentReply`), que avisa al usuario, no al admin.
   *
   * Como todo lo que pasa por `createAdminNotification`, dispara los 4 canales:
   * queda en el panel, suma a la campanita, entra en el toast de pendientes y
   * sale por email.
   */
  async notifyAdminNewPostComment(data: {
    userName: string;
    postDescription: string;
    postId: number;
    commentPreview: string;
    relatedUserId: number;
  }) {
    const tema =
      data.postDescription.length > 60
        ? `${data.postDescription.slice(0, 60)}…`
        : data.postDescription;

    const preview =
      data.commentPreview.length > 80
        ? `${data.commentPreview.slice(0, 80)}…`
        : data.commentPreview;

    await this.createAdminNotification(
      NotificationType.ADMIN_COMENTARIO_PUBLICACION,
      'Nuevo comentario en una publicación',
      `${data.userName} comentó tu publicación sobre "${tema}": "${preview}"`,
      null,
      data.relatedUserId,
      '📣',
    );
  }

  // -----------------------------------------------------
  // GET para el admin
  // -----------------------------------------------------
  async getForAdmin() {
    return this.repo.find({
      where: { targetRole: 'admin' },
      order: { createdAt: 'DESC' },
    });
  }

  // -----------------------------------------------------
  // MARCAR TODAS COMO LEÍDAS (admin)
  // -----------------------------------------------------
  async markAllAdminAsRead() {
    await this.repo
      .createQueryBuilder()
      .update()
      .set({ read: true })
      .where("targetRole = 'admin' AND read = false")
      .execute();
    return { message: 'Todas las notificaciones del admin marcadas como leídas' };
  }
}