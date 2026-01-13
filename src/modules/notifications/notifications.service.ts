import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { UsersService } from '../users/users.service';
import { SearchPreferencesService } from '../search-preferences/search-preferences.service';
import { Property } from '../properties/entities/property.entity';
import { EmailService } from './email/email.service';
import { EmailTemplates } from './email/email-template';

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
  // MATCHES CON MÁRGENES
  // -----------------------------------------------------

  private priceMatches(propertyPrice: number, preferredPrice?: number): boolean {
    if (!preferredPrice || !propertyPrice) return false;
    let tolerancePercent = 6;
    if (preferredPrice >= 50000 && preferredPrice < 150000) tolerancePercent = 7;
    if (preferredPrice >= 150000) tolerancePercent = 5;

    const min = preferredPrice * (1 - tolerancePercent / 100);
    const max = preferredPrice * (1 + tolerancePercent / 100);
    return propertyPrice >= min && propertyPrice <= max;
  }

  private m2Matches(propM2: number, prefM2: number): boolean {
    if (!prefM2 || !propM2) return false;
    const min = prefM2 * 0.85; 
    const max = prefM2 * 1.30; 
    return propM2 >= min && propM2 <= max;
  }

  private antiquityMatches(propAnt: number, prefMaxAnt: number): boolean {
    if (prefMaxAnt === null || prefMaxAnt === undefined) return true;
    return Number(propAnt) <= (Number(prefMaxAnt) + 2);
  }

  // -----------------------------------------------------
  // NUEVA PROPIEDAD
  // -----------------------------------------------------
  async handleNewProperty(property: Property) {
    const prefs = await this.searchPrefService.findAllWithUsers();
    const imageUrls = property.images?.map((i) => i.url) ?? [];
    const notifiedUserIds = new Set<number>();

    for (const pref of prefs) {
      if (!pref.notifyNewMatches || !pref.user?.email) continue;

      const matched: string[] = [];
      
      const prefTypeId = pref.typeOfProperty?.id ? Number(pref.typeOfProperty.id) : null;
      const propTypeId = property.typeOfProperty?.id ? Number(property.typeOfProperty.id) : null;

      // --- LOG DE DEBUG ---
      console.log(`\n[DEBUG] Evaluando Match - Usuario: ${pref.user.id} (${pref.user.email})`);
      console.log(`[DEBUG] Tipo Prop: ${propTypeId} | Tipo Pref: ${prefTypeId}`);

      // 1. FILTRO ESTRICTO DE TIPO
      if (prefTypeId && prefTypeId !== propTypeId) {
        console.log(`[DEBUG] Salto: Tipos no coinciden.`);
        continue;
      }

      // 🟢 1.1 FILTRO ESTRICTO DE OPERACIÓN (Venta/Alquiler)
      // Si el usuario eligió una preferencia y no coincide con la propiedad, saltamos.
      if (pref.operationType && pref.operationType !== property.operationType) {
        console.log(`[DEBUG] Salto: Operación no coincide (${pref.operationType} vs ${property.operationType})`);
        continue;
      }

      // 2. CONTEO DINÁMICO DE CRITERIOS
      const criteriaToCheck = [
        pref.zone,
        pref.typeOfProperty,
        pref.preferredPrice,
        pref.minRooms,
        pref.minBathrooms,
        pref.m2,
        pref.operationType,
        pref.maxAntiquity,
        pref.property_deed,
        pref.barrio, 
        pref.localidad,
      ];
      
      const totalCriteria = criteriaToCheck.filter(
        (v) => v !== null && v !== undefined && v !== false
      ).length;

      // ---------------- ZONA ----------------
      if (pref.zone && property.zone?.toLowerCase().includes(pref.zone.toLowerCase())) {
        matched.push(`Zona: ${pref.zone}`);
      }

      // ---------------- UBICACIÓN (LOCALIDAD Y BARRIO) ----------------
      // Comprobamos Localidad
      if (pref.localidad && property.localidad?.trim().toLowerCase() === pref.localidad.toLowerCase()) {
        matched.push(`Localidad: ${pref.localidad}`);
      }

      // 🟢 3. MATCH DE OPERACIÓN (Para el mensaje de la notificación)
      if (pref.operationType && pref.operationType === property.operationType) {
        matched.push(`Operación: ${property.operationType}`);
      }

      // Comprobamos Barrio (Si el usuario especificó barrio, debe coincidir)
      if (pref.barrio && property.barrio?.trim().toLowerCase() === pref.barrio.toLowerCase()) {
        matched.push(`Barrio: ${pref.barrio}`);
      }

      // ---------------- TIPO ----------------
      if (prefTypeId && prefTypeId === propTypeId) {
        matched.push(`Tipo: ${property.typeOfProperty?.name || 'Inmueble'}`);
      }

      // ---------------- PRECIO (Informativo) ----------------
      if (pref.preferredPrice && this.priceMatches(property.price, pref.preferredPrice)) {
        const diff = property.price - pref.preferredPrice;
        const sign = diff > 0 ? '+' : '';
        matched.push(`Precio: $${property.price} (${sign}${diff} vs tu busqueda)`);
        console.log(`[DEBUG] Match Precio: OK`);
      }

      // ---------------- HABITACIONES ----------------
      if (pref.minRooms && (property.rooms ?? 0) >= pref.minRooms) {
        matched.push(`Habitaciones: ${property.rooms} (minimo ${pref.minRooms})`);
      }

      // ---------------- BAÑOS ----------------
      if (pref.minBathrooms && (property.bathrooms ?? 0) >= pref.minBathrooms) {
        matched.push(`Banios: ${property.bathrooms}`);
      }

      // ---------------- M2 ----------------
      if (pref.m2 && this.m2Matches(property.m2, pref.m2)) {
        matched.push(`Superficie: ${property.m2} m2 (Acorde a tu busqueda)`);
      }

      // ---------------- ESCRITURAS ----------------
      if (pref.property_deed === true && property.property_deed === true) {
        matched.push('Tiene escrituras');
      }

      // ---------------- ANTIGÜEDAD ----------------
      if (pref.maxAntiquity !== undefined && pref.maxAntiquity !== null) {
        if (this.antiquityMatches(Number(property.antiquity), Number(pref.maxAntiquity))) {
          matched.push(`Antiguedad: ${property.antiquity} años`);
        }
      }

      console.log(`[DEBUG] Coincidencias: ${matched.length} de ${totalCriteria}`);

      // ---------------- ENVÍO DE MATCH ----------------
      if (matched.length > 0) {
        notifiedUserIds.add(pref.user.id);

        await this.repo.save(
          this.repo.create({
            user: pref.user,
            title: 'Coincidencia encontrada',
            message: `Esta propiedad cumple ${matched.length} de tus ${totalCriteria} criterios.`,
          }),
        );

        try {
          // Solo intentamos enviar si no excediste la cuota. 
          // El try/catch evita que el proceso se rompa si falla el mail.
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
              property.operationType
            ),
          );
        } catch (err) {
          console.error(`[ERROR MAIL] No se pudo enviar a ${pref.user.email}. Posible cuota excedida.`);
        }
      }
    }

    await this.broadcastNewProperty(property, notifiedUserIds).catch((err) =>
      console.error('Error en broadcast global:', err),
    );
  }

  // -----------------------------------------------------
  // NOTIFICACIÓN GLOBAL
  // -----------------------------------------------------
  async broadcastNewProperty(property: Property, excludedIds: Set<number> = new Set()) {
    const allUsers = await this.usersService.getAllUsers();
    const imageUrls = property.images?.map((i) => i.url) ?? [];

    const usersToNotify = allUsers.filter((u) => u.email && !excludedIds.has(u.id));
    if (usersToNotify.length === 0) return;

    const notifications = usersToNotify.map((user) =>
      this.repo.create({
        user,
        title: 'Nueva propiedad publicada',
        message: `Se ha publicado: ${property.title}`,
      }),
    );
    await this.repo.save(notifications);

    try {
      await this.emailService.sendMultipleEmails(
        usersToNotify.map((u) => u.email),
        'Nueva propiedad publicada',
        EmailTemplates.newProperty(property.title,  `${property.barrio || ''}, ${property.localidad || ''}`, property.price, imageUrls, property.operationType),
      );
    } catch (err) {
      console.error('[ERROR MAIL GLOBAL] Fallo el envio masivo.');
    }
  }

  // -----------------------------------------------------
  // BAJADA DE PRECIO
  // -----------------------------------------------------
  async handlePriceChange(property: Property, oldPrice: number) {
    if ((property.price ?? 0) >= oldPrice) return;
    const users = await this.usersService.getAllUsers();
    const imageUrls = property.images?.map((i) => i.url) ?? [];

    const notifications = users.filter((u) => u.email).map((user) =>
      this.repo.create({
        user,
        title: 'Bajo de precio',
        message: `${property.title} bajo a $${property.price}`,
      }),
    );
    await this.repo.save(notifications);

    try {
      await this.emailService.sendMultipleEmails(
        users.filter((u) => u.email).map((u) => u.email),
        'Actualización de precio',
        EmailTemplates.priceDrop(property.title, property.zone, oldPrice, property.price, imageUrls),
      );
    } catch (err) {
      console.error('[ERROR MAIL PRICE] Fallo el envio de baja de precio.');
    }
  }

  async getForUser(userId: number) {
    return this.repo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }
}