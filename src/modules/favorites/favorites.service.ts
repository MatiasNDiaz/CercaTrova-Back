import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { isUniqueViolation } from 'src/common/helpers/database-error.helper';
import { InjectRepository } from '@nestjs/typeorm';
import { Property } from '../properties/entities/property.entity';
import { User } from '../users/entities/user.entity';
import { Repository } from 'typeorm';
import { Favorite } from './entities/favorite.entity';
import { NotificationService } from '../notifications/notifications.service'; // 👈

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Favorite)
    private readonly favoriteRepo: Repository<Favorite>,

    private readonly notificationService: NotificationService, // 👈
  ) {}

  async createFavorite(createFavoriteDto: CreateFavoriteDto) {
    const { user_id, property_id } = createFavoriteDto;

    // (B2): excepciones HTTP reales en vez de Error genérico (evita 500)
    const user = await this.userRepo.findOneBy({ id: user_id });
    if (!user) throw new NotFoundException('No se encontró al usuario');

    const property = await this.propertyRepo.findOneBy({ id: property_id });
    if (!property) throw new NotFoundException('No se encontró la propiedad');

    const exists = await this.favoriteRepo.findOneBy({ user_id, property_id });
    if (exists) throw new ConflictException('La propiedad ya está en favoritos');

    const newFavorite = this.favoriteRepo.create({ user, property, user_id, property_id });

    let saved: Favorite;
    try {
      saved = await this.favoriteRepo.save(newFavorite);
    } catch (error) {
      // 🧱 PATRÓN unique violation → 409: dos POST simultáneos del mismo
      // favorito chocan contra la PK compuesta (antes salía como 500)
      if (isUniqueViolation(error)) {
        throw new ConflictException('La propiedad ya está en favoritos');
      }
      throw error;
    }

    // 👇 Notificar al admin — no bloqueante
    this.notificationService
      .notifyAdminNewFavorite({
        userName: user.name,
        propertyTitle: property.title,
        propertyId: property.id,
        relatedUserId: user.id, // 👈
      })
      .catch((err) => console.error('[NOTIF ADMIN] Error en favorito:', err));

    return saved;
  }

  async getAllFavorites(userId: number) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    return this.favoriteRepo.find({
      where: { user_id: userId },
      relations: ['property', 'property.images', 'property.typeOfProperty'],
    });
  }

  async deleteOneFavorite(userId: number, propertyId: number) {
    const favorite = await this.favoriteRepo.findOneBy({
      user_id: userId,
      property_id: propertyId,
    });

    if (!favorite) throw new NotFoundException('El favorito no existe');

    await this.favoriteRepo.delete({ user_id: userId, property_id: propertyId });
    return { message: 'Favorito eliminado correctamente' };
  }

  async deleteAllFavorites(userId: number) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    await this.favoriteRepo.delete({ user_id: userId });
    return { message: 'Todos los favoritos fueron eliminados' };
  }
}