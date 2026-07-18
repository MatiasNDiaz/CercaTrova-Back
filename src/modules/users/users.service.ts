import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CloudinaryService } from 'src/common/Cloudinary/cloudinary.service';
import * as bcrypt from 'bcrypt';
import { PropertyRequest } from '../PropertyRequest/entities/PropertyRequest';
import { Role } from './enums/role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly cloudinaryService: CloudinaryService, //
    @InjectRepository(PropertyRequest)
  private readonly propertyRequestRepository: Repository<PropertyRequest>,
  ) {}

   // Crear o actualizar foto de perfil
  async updateProfilePhoto(id: number, file: Express.Multer.File): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) throw new BadRequestException('Usuario no encontrado');

    if (!file) throw new BadRequestException('No se proporcionó ninguna imagen');

    // 1. Subir a Cloudinary con el ID del usuario
    const result = await this.cloudinaryService.uploadProfilePhoto(file, id);

    // 2. Guardar la URL en la propiedad 'photo' de la entidad
    user.photo = result.secure_url;
    
    return await this.userRepository.save(user);
  }


  // Crear usuario
  async createUser(createUserDto: CreateUserDto): Promise<User> {
    try {
      // Verificación: email único
      const existing = await this.userRepository.findOne({
        where: { email: createUserDto.email },
      });

      // 🔒 SEGURIDAD (B1): mensaje genérico — no revelar si el email existe
      if (existing) {
        throw new BadRequestException('No se pudo completar el registro. Verificá los datos ingresados.');
      }

      // 🔒 SEGURIDAD (C2): el hash de bcrypt vive acá — única fuente de verdad.
      // No se hashea el string vacío: los usuarios de Google se crean con
      // password '' y esa marca se usa en el login para detectarlos.
      if (createUserDto.password) {
        createUserDto.password = await bcrypt.hash(createUserDto.password, 10);
      }

      const user: User = this.userRepository.create(createUserDto);
      const saved = await this.userRepository.save(user);

      // 🔒 SEGURIDAD (C2): nunca devolver el password (ni hasheado) al caller
      delete saved.password;
      return saved;

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
// 🔒 SEGURIDAD: Si viene password en el Body, la hasheamos antes de pisar el objeto
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
      // 🔒 SEGURIDAD (punto 15): cambiar el password revoca todas las
      // sesiones activas del usuario
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    }

    // Usamos Object.assign para actualizar solo los campos que vienen en el DTO
    Object.assign(user, updateUserDto);
    return await this.userRepository.save(user);
  }

  // Eliminar usuario
async deleteUser(id: number): Promise<void> {
  // 1. Verificar que existe
  const user = await this.userRepository.findOneBy({ id });
  if (!user) throw new BadRequestException('Usuario no encontrado');

  // 2. Borrar sus property_requests primero
  await this.propertyRequestRepository.delete({ userId: id });

  // 3. Ahora sí borrar el usuario
  await this.userRepository.delete(id);

  // 4. Limpiar foto de Cloudinary
  if (user.photo) {
    const publicId = `userPhotoProfile/user_${id}`;
    await this.cloudinaryService.deleteFile(publicId);
  }
}

  // Buscar usuario por email (sin password, por el select:false de la entidad)
  async findUserByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOneBy({ email });
  }

  // 🔒 SEGURIDAD (C8): el password tiene select:false en la entidad; este
  // método lo carga explícitamente y SOLO debe usarse para validar el login.
  async findUserByEmailWithPassword(email: string): Promise<User | null> {
    return await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  // 🔒 SEGURIDAD (punto 15): incrementa tokenVersion e invalida al instante
  // todos los JWT emitidos hasta ahora para este usuario (logout real)
  async incrementTokenVersion(userId: number): Promise<void> {
    await this.userRepository.increment({ id: userId }, 'tokenVersion', 1);
  }

  // ✔ NUEVO: Verifica si un usuario puede recibir notificaciones
  async canReceiveNotifications(userId: number): Promise<boolean> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new BadRequestException('Usuario no encontrado');

    // Como TODO usuario debe registrarse con email, esto siempre será true
    return !!user.email;
  }


  // users.service.ts — agregar este método
async getAdminUsers() {
  return this.userRepository.find({
    where: { role: Role.ADMIN },
  });
}
}
