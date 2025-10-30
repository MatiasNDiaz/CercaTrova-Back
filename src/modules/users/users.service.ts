import { Injectable } from '@nestjs/common';
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

  async createUser(createUser: CreateUserDto): Promise<User> {
    try {
      const user:User = this.userRepository.create(createUser);
      return await this.userRepository.save(user);

    } catch (error) {
      // Manejo de error, por ejemplo:
      throw new Error('No se pudo crear el usuario: ' + error.message);
    }
  }

  async getAllUsers(): Promise<User[]> {
    try {
      const users:User[] = await this.userRepository.find();
      return users;
    } catch (error) {
      // Manejo de error, por ejemplo:
      throw new Error('No se pudo encontrar a los usuarios: ' + error.message);
    }
  }

  async getUserById(id:number): Promise<User | null> {
    try {
      const user:User | null = await this.userRepository.findOneBy({id});
      return user;
    } catch (error) {
      // Manejo de error, por ejemplo:
      throw new Error('No se pudo encontrar a los usuarios: ' + error.message);
    }
  }

  async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const user: User | null = await this.userRepository.findOneBy({ id });
    if (!user) throw new Error('Usuario no encontrado');

    Object.assign(user, updateUserDto); // actualiza los campos
    return await this.userRepository.save(user);
  } 

  async deleteUser(id: number): Promise<void> {
    const result = await this.userRepository.delete(id);
    if (result.affected === 0) throw new Error('Usuario no encontrado');
  }

  // Funcion para verificar si existe un usuario por su email:
  async findUserByEmail(email: string): Promise<User | null> {
  return await this.userRepository.findOneBy({ email });
  }
}

