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
    private readonly repo: Repository<Notification>,
    private readonly usersService: UsersService,
    private readonly searchPrefService: SearchPreferencesService,
    private readonly emailService: EmailService
  ) {}

  // -----------------------------------------------------
  // MATCH DE PRECIO (DINÁMICO)
  // -----------------------------------------------------
  private priceMatches(propertyPrice: number, preferredPrice?: number): boolean {
    if (!preferredPrice || !propertyPrice) return false;

    let tolerancePercent = 6;
    if (preferredPrice >= 50_000 && preferredPrice < 150_000) tolerancePercent = 7;
    if (preferredPrice >= 150_000) tolerancePercent = 5;

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
      if (!pref.notifyNewMatches || !pref.user?.email) continue;

      const matched: string[] = [];

      // -------- TOTAL DE CRITERIOS (BIEN CONTADO) --------
      const totalCriteria = [
        pref.zone,
        pref.typeOfProperty,
        pref.preferredPrice,
        pref.minRooms,
        pref.minBathrooms,
        pref.m2,
        pref.maxAntiquity,
        pref.property_deed === true ? true : null
      ].filter(v => v !== null && v !== undefined).length;

      // ---------------- ZONA ----------------
      if (
        pref.zone &&
        property.zone?.toLowerCase().includes(pref.zone.toLowerCase())
      ) {
        matched.push(`Zona: ${pref.zone}`);
      }

      // ---------------- TIPO ----------------
      if (
        pref.typeOfProperty &&
        property.typeOfProperty?.id === pref.typeOfProperty.id
      ) {
        matched.push(`Tipo de propiedad: ${property.typeOfProperty.name}`);
      }

      // ---------------- PRECIO ----------------
      if (
        pref.preferredPrice &&
        this.priceMatches(property.price, pref.preferredPrice)
      ) {
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

      // ---------------- M2 ----------------
      if (pref.m2 && (property.m2 ?? 0) >= pref.m2) {
        matched.push(`Superficie: ${pref.m2} m²`);
      }

      // ---------------- ESCRITURAS (LÓGICA REAL) ----------------
      if (pref.property_deed === true && property.property_deed === true) {
        matched.push('Tiene escrituras');
      }

      // ---------------- ANTIGÜEDAD ----------------
      if (
        pref.maxAntiquity !== undefined &&
        pref.maxAntiquity !== null &&
        Number(property.antiquity) <= Number(pref.maxAntiquity)
      ) {
        matched.push(`Antigüedad: hasta ${pref.maxAntiquity} años`);
      }

      // ---------------- RESULTADO ----------------
      if (matched.length > 0) {
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

    console.log({
  prefTypeId: prefs[0]?.typeOfProperty?.id,
  propertyTypeId: property.typeOfProperty?.id,
});


    // ---------------- GUARDAR + ENVIAR ----------------
    if (notifications.length > 0) {
      await this.repo.save(notifications);

      for (const mail of emailsToSend) {
        try {
          await this.emailService.sendEmail(
            mail.email,
            'Nueva propiedad según tus preferencias',
            EmailTemplates.matchSearch(
              mail.name,
              property.title,
              property.zone,
              property.price,
              imageUrls,
              mail.characteristics,
              mail.matchedCount,
              mail.totalCount
            )
          );
        } catch (err) {
          console.error(`Error enviando mail a ${mail.email}`, err);
        }
      }
    }

    // 👉 NOTIFICACIÓN GLOBAL
    this.broadcastNewProperty(property).catch(err =>
      console.error('Error notificando nueva propiedad global:', err)
    );
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

  // -----------------------------------------------------
  // OBTENER NOTIFICACIONES POR USUARIO
  // -----------------------------------------------------
  async getForUser(userId: number) {
    return this.repo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' }
    });
  }
}
