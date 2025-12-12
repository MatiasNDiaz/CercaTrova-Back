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
    private repo: Repository<Notification>,

    private usersService: UsersService,
    private searchPrefService: SearchPreferencesService,
    private emailService: EmailService
  ) {}

  // -----------------------------------------------------
  // Crear notificación individual
  // -----------------------------------------------------
  async createForUser(userId: number, title: string, message: string) {
    const user = await this.usersService.getUserById(userId);
    if (!user || !user.email) return;

    const n = this.repo.create({ user, title, message });
    await this.repo.save(n);

    await this.emailService.sendEmail(
      user.email,
      title,
      EmailTemplates.globalMessage(message)
    );
  }

  // -----------------------------------------------------
  // Envío MASIVO para nueva propiedad (sin duplicar envíos)
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

    await this.emailService.sendMultipleEmails(
      users.map(u => u.email),
      'Nueva propiedad publicada',
      EmailTemplates.newProperty(
        property.title,
        property.zone,
        property.price,
        imageUrls
      )
    );
  }

  // -----------------------------------------------------
  // Nueva propiedad → preferencias con score y características
  // -----------------------------------------------------
  async handleNewProperty(property: Property) {
    const prefs = await this.searchPrefService.findAllWithUsers();
    const imageUrls = property.images?.map(i => i.url) ?? [];

    const notificationsToSave: Notification[] = [];
    const matchedUsersEmails: { email: string; name: string; characteristics: string[] }[] = [];

    for (const pref of prefs) {
      if (!pref.notifyNewMatches) continue;

      const matchedCharacteristics: string[] = [];

      if (pref.zone && property.zone?.toLowerCase().includes(pref.zone.toLowerCase()))
        matchedCharacteristics.push(`Zona: ${pref.zone}`);

      if (pref.typeOfProperty && property.typeOfProperty?.name === pref.typeOfProperty)
        matchedCharacteristics.push(`Tipo: ${pref.typeOfProperty}`);

      if (pref.minPrice && property.price >= pref.minPrice)
        matchedCharacteristics.push(`Precio mínimo: ${pref.minPrice}`);

      if (pref.maxPrice && property.price <= pref.maxPrice)
        matchedCharacteristics.push(`Precio máximo: ${pref.maxPrice}`);

      if (pref.minRooms && property.rooms >= pref.minRooms)
        matchedCharacteristics.push(`Habitaciones mínimas: ${pref.minRooms}`);

      if (pref.minBathrooms && property.bathrooms >= pref.minBathrooms)
        matchedCharacteristics.push(`Baños mínimos: ${pref.minBathrooms}`);

      if (pref.m2 && property.m2 >= pref.m2)
        matchedCharacteristics.push(`Metros cuadrados: ${pref.m2}`);

      if (matchedCharacteristics.length > 0 && pref.user.email) {
        matchedUsersEmails.push({
          email: pref.user.email,
          name: pref.user.name || 'Usuario',
          characteristics: matchedCharacteristics
        });

        const note = this.repo.create({
          user: pref.user,
          title: 'Nueva propiedad que coincide con tus preferencias',
          message: `Tu propiedad coincide con ${matchedCharacteristics.length} características: ${matchedCharacteristics.join(', ')}.`
        });

        notificationsToSave.push(note);
      }
    }

    if (notificationsToSave.length > 0) {
      await this.repo.save(notificationsToSave);

      for (const u of matchedUsersEmails) {
        await this.emailService.sendEmail(
          u.email,
          'Nueva propiedad según tus preferencias',
          EmailTemplates.matchSearch(
            u.name,
            property.title,
            property.zone,
            property.price,
            imageUrls,
            u.characteristics
          )
        );
      }
    }

    // No tocamos el envío global
    await this.broadcastNewProperty(property);
  }

  // -----------------------------------------------------
  // Obtener las notificaciones de un usuario
  // -----------------------------------------------------
  async getForUser(userId: number) {
    return this.repo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' }
    });
  }

  // -----------------------------------------------------
  // Notificación por CAMBIO DE PRECIO
  // -----------------------------------------------------
  async handlePriceChange(property: Property, oldPrice: number) {
    try {
      const newPrice = property.price;
      if (newPrice >= oldPrice) return;

      const users = await this.usersService.getAllUsers();
      const imageUrls = property.images?.map(i => i.url) ?? [];

      const notifications = users
        .filter(u => u.email)
        .map(user =>
          this.repo.create({
            user,
            title: 'Actualización de precio',
            message: `La propiedad "${property.title}" bajó su precio de ${oldPrice} a ${newPrice}.`
          })
        );

      await this.repo.save(notifications);

      await this.emailService.sendMultipleEmails(
        users.map(u => u.email),
        'Actualización de precio',
        EmailTemplates.priceDrop(
          property.title,
          property.zone,
          oldPrice,
          newPrice,
          imageUrls
        )
      );

    } catch (err) {
      console.error('Error en handlePriceChange:', err);
    }
  }
}
