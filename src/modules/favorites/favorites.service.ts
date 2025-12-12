import { Injectable } from '@nestjs/common';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Property } from '../properties/entities/property.entity';
import { User } from '../users/entities/user.entity';
import { Repository } from 'typeorm';
import { Favorite } from './entities/favorite.entity';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Favorite)
    private readonly favoriteRepo: Repository<Favorite>,
  ) {}

  // ---------------------------------------------------
  // 1) CREAR FAVORITO
  // ---------------------------------------------------
  async createFavorite(createFavoriteDto: CreateFavoriteDto) {
    const { user_id, property_id } = createFavoriteDto;

    const user = await this.userRepo.findOneBy({ id: user_id });
    if (!user) throw new Error("No se encontró al usuario");

    const property = await this.propertyRepo.findOneBy({ id: property_id });
    if (!property) throw new Error("No se encontró la propiedad");

    const exists = await this.favoriteRepo.findOneBy({ user_id, property_id });
    if (exists) throw new Error("La propiedad ya está en favoritos");

    const newFavorite = this.favoriteRepo.create({
      user,
      property,
      user_id,
      property_id
    });

    return this.favoriteRepo.save(newFavorite);
  }

  // ---------------------------------------------------
  // 2) OBTENER TODOS LOS FAVORITOS DE UN USUARIO
  // ---------------------------------------------------
  async getAllFavorites(userId: number) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new Error("Usuario no encontrado");

    return this.favoriteRepo.find({
      where: { user_id: userId },
      relations: ["property"],
    });
  }

  // ---------------------------------------------------
  // 3) ELIMINAR UN FAVORITO EN PARTICULAR
  // ---------------------------------------------------
  async deleteOneFavorite(userId: number, propertyId: number) {
    const favorite = await this.favoriteRepo.findOneBy({
      user_id: userId,
      property_id: propertyId
    });

    if (!favorite) {
      throw new Error("El favorito no existe");
    }

    await this.favoriteRepo.delete({
      user_id: userId,
      property_id: propertyId
    });

    return { message: "Favorito eliminado correctamente" };
  }

  // ---------------------------------------------------
  // 4) ELIMINAR TODOS LOS FAVORITOS DE UN USUARIO
  // ---------------------------------------------------
  async deleteAllFavorites(userId: number) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new Error("Usuario no encontrado");

    await this.favoriteRepo.delete({ user_id: userId });

    return { message: "Todos los favoritos fueron eliminados" };
  }
}
