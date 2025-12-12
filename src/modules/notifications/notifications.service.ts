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

    // enviar email individual
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

    // 1) crear notificaciones en DB
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

    // 2) email global masivo (en un solo envío)
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
  // Nueva propiedad → preferencias
  // -----------------------------------------------------
  async handleNewProperty(property: Property) {
    const prefs = await this.searchPrefService.findAllWithUsers();
    const imageUrls = property.images?.map(i => i.url) ?? [];

    const matchedUsers: string[] = [];

    for (const pref of prefs) {
      if (!pref.notifyNewMatches) continue;

      const match =
        (!pref.zone ||
          property.zone?.toLowerCase().includes(pref.zone.toLowerCase())) &&
        (!pref.typeOfProperty ||
          property.typeOfProperty?.name === pref.typeOfProperty) &&
        (!pref.minPrice || property.price >= pref.minPrice) &&
        (!pref.maxPrice || property.price <= pref.maxPrice) &&
        (!pref.minRooms || property.rooms >= pref.minRooms) &&
        (!pref.minBathrooms || property.bathrooms >= pref.minBathrooms) &&
        (!pref.m2 || property.m2 >= pref.m2);

      if (match && pref.user.email) {
        matchedUsers.push(pref.user.email);

        const note = this.repo.create({
          user: pref.user,
          title: 'Nueva propiedad que coincide con tus preferencias',
          message: `Hay una propiedad en ${property.zone} que te puede interesar.`
        });

        await this.repo.save(note);
      }
    }

    // envío masivo a los que hacen match
    if (matchedUsers.length > 0) {
      await this.emailService.sendMultipleEmails(
        matchedUsers,
        'Nueva propiedad según tus preferencias',
        EmailTemplates.newProperty(
          property.title,
          property.zone,
          property.price,
          imageUrls
        )
      );
    }

    // envío global (solo UNA VEZ, sin duplicar)
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

    // Solo notificamos si el precio BAJÓ
    if (newPrice >= oldPrice) return;

    const users = await this.usersService.getAllUsers();
    const imageUrls = property.images?.map(i => i.url) ?? [];

    // Crear notificaciones individuales en la DB
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

    // Enviar emails MASIVOS
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
