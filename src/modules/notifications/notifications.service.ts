import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { UsersService } from '../users/users.service';
import { SearchPreferencesService } from '../search-preferences/search-preferences.service';
import { Property } from '../properties/entities/property.entity';
import { EmailService } from './email/email.service';
import { EmailTemplates } from './email/email-template';

type MatchEmailPayload = {
  email: string;
  name: string;
  characteristics: string[];
  matchedCount: number;
  totalCount: number;
};

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private repo: Repository<Notification>,
    private usersService: UsersService,
    private searchPrefService: SearchPreferencesService,
    private emailService: EmailService
  ) {}

  // -----------------------------------------------------
  // MATCH DE PRECIO
  // -----------------------------------------------------
  private priceMatches(propertyPrice: number, preferredPrice?: number): boolean {
    if (!preferredPrice) return false;

    let tolerancePercent = 6;
    if (preferredPrice >= 50000 && preferredPrice < 150000) tolerancePercent = 7;
    if (preferredPrice >= 150000) tolerancePercent = 5;

    const min = preferredPrice * (1 - tolerancePercent / 100);
    const max = preferredPrice * (1 + tolerancePercent / 100);
    return propertyPrice >= min && propertyPrice <= max;
  }

  // -----------------------------------------------------
  // NUEVA PROPIEDAD → MATCH CON PREFERENCIAS
  // -----------------------------------------------------
  async handleNewProperty(property: Property) {
    const prefs = await this.searchPrefService.findAllWithUsers();
    const imageUrls = property.images?.map(i => i.url) ?? [];

    const notifications: Notification[] = [];
    const emailsToSend: MatchEmailPayload[] = [];

    for (const pref of prefs) {
      if (!pref.notifyNewMatches) continue;

      const matched: string[] = [];

      const totalCriteria = [
        pref.zone,
        pref.typeOfProperty,
        pref.preferredPrice,
        pref.minRooms,
        pref.minBathrooms,
        pref.m2,
        pref.maxAntiquity
      ].filter(Boolean).length;

      // ---------------- ZONA ----------------
      if (pref.zone && property.zone?.toLowerCase().includes(pref.zone.toLowerCase())) {
        matched.push(`Zona: ${pref.zone}`);
      }

      // ---------------- TIPO ----------------
      if (pref.typeOfProperty && property.typeOfProperty?.id === pref.typeOfProperty.id) {
        matched.push(`Tipo de Propiedad: ${property.typeOfProperty?.name || 'N/D'}`);
      }

      // ---------------- PRECIO ----------------
      if (pref.preferredPrice && this.priceMatches(property.price ?? 0, pref.preferredPrice)) {
        matched.push(`Precio cercano a $${pref.preferredPrice}`);
      }

      // ---------------- HABITACIONES ----------------
      if (pref.minRooms && (property.rooms ?? 0) >= pref.minRooms) {
        matched.push(`Cantidad de Habitaciones: ${pref.minRooms}`);
      }

      // ---------------- BAÑOS ----------------
      if (pref.minBathrooms && (property.bathrooms ?? 0) >= pref.minBathrooms) {
        matched.push(`Cantidad de Baños: ${pref.minBathrooms}`);
      }

      // ---------------- M2 ----------------
      if (pref.m2 && (property.m2 ?? 0) >= pref.m2) {
        matched.push(`Superficie: ${pref.m2} m²`);
      }

      // ---------------- ANTIGÜEDAD ----------------
     // ---------------- ANTIGÜEDAD ----------------
if (pref.maxAntiquity !== undefined && pref.maxAntiquity !== null) {
  if (Number(property.antiquity) <= Number(pref.maxAntiquity)) {
    matched.push(`Antigüedad: ${pref.maxAntiquity} años`);
  }
}


      // ---------------- RESULTADO ----------------
      if (matched.length > 0 && pref.user?.email) {
        notifications.push(
          this.repo.create({
            user: pref.user,
            title: 'Nueva propiedad según tus preferencias',
            message: `Esta propiedad cumple ${matched.length} de ${totalCriteria} características.`
          })
        );

        emailsToSend.push({
          email: pref.user.email,
          name: pref.user.name || 'Usuario',
          characteristics: matched,
          matchedCount: matched.length,
          totalCount: totalCriteria
        });
      }
    }

    // ---------------- GUARDAR + ENVIAR ----------------
    if (notifications.length) {
      await this.repo.save(notifications);

      for (const u of emailsToSend) {
        try {
          await this.emailService.sendEmail(
            u.email,
            'Nueva propiedad según tus preferencias',
            EmailTemplates.matchSearch(
              u.name,
              property.title,
              property.zone,
              property.price,
              imageUrls,
              u.characteristics,
              u.matchedCount,
              u.totalCount
            )
          );
        } catch (err) {
          console.error(`Error enviando mail a ${u.email}:`, err);
        }
      }
    }

    // 👉 NOTIFICACIÓN GLOBAL
    this.broadcastNewProperty(property).catch(err => {
      console.error('Error notificando nueva propiedad global:', err);
    });
  }

  // -----------------------------------------------------
  // NOTIFICACIÓN GLOBAL
  // -----------------------------------------------------
  async broadcastNewProperty(property: Property) {
    const users = await this.usersService.getAllUsers();
    const imageUrls = property.images?.map(i => i.url) ?? [];

    const notifications = users
      .filter(u => u.email)
      .map(user =>
        this.repo.create({
          user,
          title: 'Nueva propiedad publicada',
          message: `Se ha publicado la propiedad: ${property.title}`
        })
      );

    await this.repo.save(notifications);

    try {
      await this.emailService.sendMultipleEmails(
        users.filter(u => u.email).map(u => u.email),
        'Nueva propiedad publicada',
        EmailTemplates.newProperty(
          property.title,
          property.zone,
          property.price,
          imageUrls
        )
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
    const imageUrls = property.images?.map(i => i.url) ?? [];

    const notifications = users
      .filter(u => u.email)
      .map(user =>
        this.repo.create({
          user,
          title: 'Actualización de precio',
          message: `La propiedad "${property.title}" bajó su precio de ${oldPrice} a ${property.price}.`
        })
      );

    await this.repo.save(notifications);

    try {
      await this.emailService.sendMultipleEmails(
        users.filter(u => u.email).map(u => u.email),
        'Actualización de precio',
        EmailTemplates.priceDrop(
          property.title,
          property.zone,
          oldPrice,
          property.price,
          imageUrls
        )
      );
    } catch (err) {
      console.error('Error enviando mails de baja de precio:', err);
    }
  }

  async getForUser(userId: number) {
    return this.repo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' }
    });
  }
}
