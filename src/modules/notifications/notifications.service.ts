import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { UsersService } from '../users/users.service';
import { SearchPreferencesService } from '../search-preferences/search-preferences.service';
import { Property } from '../properties/entities/property.entity';
import { EmailService } from './email/email.service';
import { EmailTemplates } from './email/email-template';
import { PropertyRequest, RequestStatus } from '../PropertyRequest/entities/PropertyRequest';

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

  private m2Matches(propM2: number, prefM2: number): boolean {
    if (!prefM2 || !propM2) return false;
    return propM2 >= prefM2 * 0.85 && propM2 <= prefM2 * 1.30;
  }

  private antiquityMatches(propAnt: number, prefMaxAnt: number): boolean {
    if (prefMaxAnt === null || prefMaxAnt === undefined) return true;
    return Number(propAnt) <= (Number(prefMaxAnt) + 2);
  }

  // -----------------------------------------------------
  // 1. NUEVA PROPIEDAD — matching + broadcast global
  // -----------------------------------------------------
  async handleNewProperty(property: Property) {
    const prefs = await this.searchPrefService.findAllWithUsers();
    const imageUrls = property.images?.map((i) => i.url) ?? [];
    const notifiedUserIds = new Set<number>();

    for (const pref of prefs) {
      if (!pref.notifyNewMatches || !pref.user?.email) continue;

      const prefTypeId = pref.typeOfProperty?.id ? Number(pref.typeOfProperty.id) : null;
      const propTypeId = property.typeOfProperty?.id ? Number(property.typeOfProperty.id) : null;

      // Filtros estrictos — si no coinciden, saltar
      if (prefTypeId && prefTypeId !== propTypeId) continue;
      if (pref.operationType && pref.operationType !== property.operationType) continue;

      // Conteo dinámico de criterios activos
      const criteriaToCheck = [
        pref.zone, pref.typeOfProperty, pref.preferredPrice,
        pref.minRooms, pref.minBathrooms, pref.m2, pref.operationType,
        pref.maxAntiquity, pref.property_deed, pref.barrio, pref.localidad,
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

      if (pref.m2 && this.m2Matches(property.m2, pref.m2))
        matched.push(`Superficie: ${property.m2} m² (acorde a tu búsqueda)`);

      if (pref.property_deed === true && property.property_deed === true)
        matched.push('Tiene escrituras');

      if (pref.maxAntiquity !== undefined && pref.maxAntiquity !== null)
        if (this.antiquityMatches(Number(property.antiquity), Number(pref.maxAntiquity)))
          matched.push(`Antigüedad: ${property.antiquity} años`);

      // ── NUEVOS: garage y patio ──
      if (pref.garage === true && property.garage === true)
        matched.push('Tiene garage');

      if (pref.patio === true && property.patio === true)
        matched.push('Tiene patio');

      if (matched.length === 0) continue;

      notifiedUserIds.add(pref.user.id);

      await this.repo.save(this.repo.create({
        user: pref.user,
        title: '¡Propiedad que te puede interesar!',
        message: `Encontramos una propiedad que cumple ${matched.length} de tus ${totalCriteria} criterios de búsqueda.`,
        propertyId: property.id, // <--- PASAR EL ID AQUÍ
      }));

      try {
        await this.emailService.sendEmail(
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
          ),
        );
      } catch {
        console.error(`[ERROR MAIL] No se pudo enviar a ${pref.user.email}`);
      }
    }

    await this.broadcastNewProperty(property, notifiedUserIds).catch((err) =>
      console.error('Error en broadcast global:', err),
    );
  }

  // -----------------------------------------------------
  // 2. BROADCAST GLOBAL — notifica a todos los usuarios
  //    que NO recibieron ya un mail de matching
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
          title: 'Nueva propiedad publicada',
          message: `Se publicó: "${property.title}" en ${property.barrio}, ${property.localidad}.`,
          propertyId: property.id,
        }),
      ),
    );

    try {
      await this.emailService.sendMultipleEmails(
        usersToNotify.map((u) => u.email),
        'Nueva propiedad publicada en CercaTrova',
        EmailTemplates.newProperty(
          property.title,
          `${property.barrio || ''}, ${property.localidad || ''}`,
          property.price,
          imageUrls,
          property.operationType,
        ),
      );
    } catch {
      console.error('[ERROR MAIL GLOBAL] Falló el envío masivo.');
    }
  }

  // -----------------------------------------------------
  // 3. BAJA DE PRECIO — solo usuarios con notifyPriceDrops: true
  // -----------------------------------------------------
  async handlePriceChange(property: Property, oldPrice: number) {
    // Solo notificamos si el precio BAJÓ
    if ((property.price ?? 0) >= oldPrice) return;

    const allUsers = await this.usersService.getAllUsers();
    const imageUrls = property.images?.map((i) => i.url) ?? [];

    // Obtener preferencias para filtrar solo los que quieren notificaciones de precio
    const prefs = await this.searchPrefService.findAllWithUsers();
    const prefsByUserId = new Map(prefs.map((p) => [p.user?.id, p]));

    const usersToNotify = allUsers.filter((u) => {
      if (!u.email) return false;
      const pref = prefsByUserId.get(u.id);
      // Si no tiene preferencias guardadas, le notificamos igual (comportamiento global)
      // Si tiene preferencias, respetamos el flag notifyPriceDrops
      return !pref || pref.notifyPriceDrops !== false;
    });

    if (usersToNotify.length === 0) return;

    await this.repo.save(
      usersToNotify.map((user) =>
        this.repo.create({
          user,
          title: '¡Bajó el precio!',
          message: `"${property.title}" bajó de $${oldPrice.toLocaleString()} a $${property.price.toLocaleString()}.`,
          propertyId: property.id,
        }),
      ),
    );

    try {
      await this.emailService.sendMultipleEmails(
        usersToNotify.map((u) => u.email),
        '¡Bajó el precio de una propiedad!',
        EmailTemplates.priceDrop(property.title, property.zone, oldPrice, property.price, imageUrls),
      );
    } catch {
      console.error('[ERROR MAIL PRICE] Falló el envío de baja de precio.');
    }
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
  // GET para el frontend
  // -----------------------------------------------------
  async getForUser(userId: number) {
    return this.repo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  // -----------------------------------------------------
  // MARCAR COMO LEÍDA
  // -----------------------------------------------------
  async markAsRead(notificationId: number) {
    await this.repo.update(notificationId, { read: true });
    return { message: 'Notificación marcada como leída' };
  }

  // -----------------------------------------------------
  // MARCAR TODAS COMO LEÍDAS
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
}