import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // Crear usuario
  async createUser(createUserDto: CreateUserDto): Promise<User> {
    try {
      // Verificación: email único
      const existing = await this.userRepository.findOne({
        where: { email: createUserDto.email },
      });

      if (existing) {
        throw new BadRequestException('El email ya está registrado');
      }

      const user: User = this.userRepository.create(createUserDto);
      return await this.userRepository.save(user);

    } catch (error) {
      throw new BadRequestException(
        'No se pudo crear el usuario: ' + error.message,
      );
    }
  }

  // Obtener todos
  async getAllUsers(): Promise<User[]> {
    try {
      return await this.userRepository.find();
    } catch (error) {
      throw new BadRequestException(
        'No se pudo obtener la lista de usuarios: ' + error.message,
      );
    }
  }

  // Obtener por ID
  async getUserById(id: number): Promise<User> {
    try {
      const user = await this.userRepository.findOneBy({ id });
      if (!user) throw new BadRequestException('Usuario no encontrado');
      return user;
    } catch (error) {
      throw new BadRequestException('Error al buscar usuario: ' + error.message);
    }
  }

  // Actualizar usuario
  async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) throw new BadRequestException('Usuario no encontrado');

    Object.assign(user, updateUserDto);
    return await this.userRepository.save(user);
  }

  // Eliminar usuario
  async deleteUser(id: number): Promise<void> {
    const result = await this.userRepository.delete(id);
    if (result.affected === 0)
      throw new BadRequestException('Usuario no encontrado');
  }

  // Buscar usuario por email
  async findUserByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOneBy({ email });
  }

  // ✔ NUEVO: Verifica si un usuario puede recibir notificaciones
  async canReceiveNotifications(userId: number): Promise<boolean> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new BadRequestException('Usuario no encontrado');

    // Como TODO usuario debe registrarse con email, esto siempre será true
    return !!user.email;
  }
}
