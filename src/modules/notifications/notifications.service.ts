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
  // MATCHES CON MÁRGENES (LÓGICA MEJORADA)
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

  // Tolerancia m2: 15% menos o hasta 30% más
  private m2Matches(propM2: number, prefM2: number): boolean {
    if (!prefM2 || !propM2) return false;
    const min = prefM2 * 0.85; 
    const max = prefM2 * 1.30; 
    return propM2 >= min && propM2 <= max;
  }

  // Tolerancia Antigüedad: Hasta 2 años adicionales al límite
  private antiquityMatches(propAnt: number, prefMaxAnt: number): boolean {
    if (prefMaxAnt === null || prefMaxAnt === undefined) return true;
    return Number(propAnt) <= (Number(prefMaxAnt) + 2);
  }

  // -----------------------------------------------------
  // NUEVA PROPIEDAD → LÓGICA DE MATCH + EVITAR SPAM
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

      // 1. FILTRO ESTRICTO DE TIPO
      if (prefTypeId && prefTypeId !== propTypeId) {
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
        pref.maxAntiquity,
        pref.property_deed,
      ];
      
      const totalCriteria = criteriaToCheck.filter(
        (v) => v !== null && v !== undefined && v !== false
      ).length;

      // ---------------- ZONA ----------------
      if (pref.zone && property.zone?.toLowerCase().includes(pref.zone.toLowerCase())) {
        matched.push(`Zona: ${pref.zone}`);
      }

      // ---------------- TIPO ----------------
      if (prefTypeId && prefTypeId === propTypeId) {
        matched.push(`Tipo de propiedad: ${property.typeOfProperty.name}`);
      }

      // ---------------- PRECIO ----------------
      if (pref.preferredPrice && this.priceMatches(property.price, pref.preferredPrice)) {
        matched.push(`Precio cercano a $${pref.preferredPrice}`);
      }

      // ---------------- HABITACIONES ----------------
      if (pref.minRooms && (property.rooms ?? 0) >= pref.minRooms) {
        matched.push(`Habitaciones: ${pref.minRooms}`);
      }

      // ---------------- BAÑOS ----------------
      if (pref.minBathrooms && (property.bathrooms ?? 0) >= pref.minBathrooms) {
        matched.push(`Baños: ${pref.minBathrooms}`);
      }

      // ---------------- M2 (Con Margen) ----------------
      if (pref.m2 && this.m2Matches(property.m2, pref.m2)) {
        matched.push(`Superficie: ${property.m2} m² (Cerca de tu búsqueda)`);
      }

      // ---------------- ESCRITURAS ----------------
      if (pref.property_deed === true && property.property_deed === true) {
        matched.push('Tiene escrituras');
      }

      // ---------------- ANTIGÜEDAD (Con Margen) ----------------
      if (pref.maxAntiquity !== undefined && pref.maxAntiquity !== null) {
        if (this.antiquityMatches(Number(property.antiquity), Number(pref.maxAntiquity))) {
          matched.push(`Antigüedad: acorde a tu preferencia`);
        }
      }

      // ---------------- ENVÍO DE MATCH ----------------
      if (matched.length > 0) {
        notifiedUserIds.add(pref.user.id);

        await this.repo.save(
          this.repo.create({
            user: pref.user,
            title: '¡Coincidencia encontrada!',
            message: `Esta propiedad cumple ${matched.length} de tus ${totalCriteria} criterios de búsqueda.`,
          }),
        );

        try {
          await this.emailService.sendEmail(
            pref.user.email,
            'Nueva propiedad según tus preferencias',
            EmailTemplates.matchSearch(
              pref.user.name || 'Usuario',
              property.title,
              property.zone,
              property.price,
              imageUrls,
              matched,
              matched.length,
              totalCriteria,
            ),
          );
        } catch (err) {
          console.error(`Error enviando match mail a ${pref.user.email}`, err);
        }
      }
    }

    await this.broadcastNewProperty(property, notifiedUserIds).catch((err) =>
      console.error('Error en broadcast global:', err),
    );
  }

  // -----------------------------------------------------
  // NOTIFICACIÓN GLOBAL (CON FILTRO DE EXCLUSIÓN)
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
        message: `Se ha publicado la propiedad: ${property.title}`,
      }),
    );
    await this.repo.save(notifications);

    try {
      await this.emailService.sendMultipleEmails(
        usersToNotify.map((u) => u.email),
        'Nueva propiedad publicada',
        EmailTemplates.newProperty(property.title, property.zone, property.price, imageUrls),
      );
    } catch (err) {
      console.error('Error enviando mails globales:', err);
    }
  }

  // -----------------------------------------------------
  // BAJADA DE PRECIO
  // -----------------------------------------------------
  async handlePriceChange(property: Property, oldPrice: number) {
    if ((property.price ?? 0) >= oldPrice) return;

    const users = await this.usersService.getAllUsers();
    const imageUrls = property.images?.map((i) => i.url) ?? [];

    const notifications = users
      .filter((u) => u.email)
      .map((user) =>
        this.repo.create({
          user,
          title: 'Actualización de precio',
          message: `La propiedad "${property.title}" bajó su precio de $${oldPrice} a $${property.price}.`,
        }),
      );

    await this.repo.save(notifications);

    try {
      await this.emailService.sendMultipleEmails(
        users.filter((u) => u.email).map((u) => u.email),
        'Actualización de precio',
        EmailTemplates.priceDrop(
          property.title,
          property.zone,
          oldPrice,
          property.price,
          imageUrls,
        ),
      );
    } catch (err) {
      console.error('Error enviando mails de baja de precio:', err);
    }
  }

  async getForUser(userId: number) {
    return this.repo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }
}