import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { handleServiceError } from 'src/common/helpers/handle-service-error.helper';
import { isUniqueViolation } from 'src/common/helpers/database-error.helper';
import { ensureExists } from 'src/common/helpers/ensure-exists.helper';
import { ConflictException, BadGatewayException } from '@nestjs/common';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CloudinaryService } from 'src/common/Cloudinary/cloudinary.service';
import * as bcrypt from 'bcrypt';
import { PropertyRequest } from '../PropertyRequest/entities/PropertyRequest';
import { Role } from './enums/role.enum';
import { AuthProvider } from './enums/auth-provider.enum';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

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
    // (ERROR_FIXES R-19): fallo del servicio externo → 502 honesto, no 500
    let result;
    try {
      result = await this.cloudinaryService.uploadProfilePhoto(file, id);
    } catch (error) {
      this.logger.error(
        `Cloudinary falló al subir la foto de perfil del usuario ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadGatewayException('No pudimos procesar la imagen, intentá de nuevo');
    }

    // 2. Guardar la URL en la propiedad 'photo' de la entidad
    user.photo = result.secure_url;
    
    return await this.userRepository.save(user);
  }


  // Crear usuario
  // (F8): `profileIncomplete` es un parámetro interno (NO viene del DTO
  // público) — solo el alta vía Google lo pasa en true, porque esos
  // usuarios arrancan sin teléfono ni contraseña local.
  /**
   * `authProvider` deja registrado si la cuenta nació del formulario del sitio
   * o del login con Google — es la fuente de la estadística "registros por
   * método" del panel. Default LOCAL: quien llama sin especificarlo es el
   * registro común.
   */
  async createUser(
    createUserDto: CreateUserDto,
    profileIncomplete = false,
    authProvider: AuthProvider = AuthProvider.LOCAL,
  ): Promise<User> {
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

      const user: User = this.userRepository.create({
        ...createUserDto,
        profileIncomplete,
        authProvider,
      });
      const saved = await this.userRepository.save(user);

      // 🔒 SEGURIDAD (C2): nunca devolver el password (ni hasheado) al caller
      delete saved.password;
      return saved;

    } catch (error) {
      // 🔒 SEGURIDAD (B1): si dos registros simultáneos chocan en la
      // constraint unique del email, respondemos el MISMO mensaje genérico
      // del pre-check — sin revelar que el email existe
      if (isUniqueViolation(error)) {
        throw new BadRequestException('No se pudo completar el registro. Verificá los datos ingresados.');
      }
      // 🧱 PATRÓN: nunca concatenar error.message al cliente; las
      // HttpException construidas a propósito se re-lanzan tal cual
      handleServiceError(this.logger, error, 'No se pudo crear el usuario');
    }
  }

  // Obtener todos
  async getAllUsers(): Promise<User[]> {
    try {
      return await this.userRepository.find();
    } catch (error) {
      handleServiceError(this.logger, error, 'No se pudo obtener la lista de usuarios');
    }
  }

  // Obtener por ID
  async getUserById(id: number): Promise<User> {
    try {
      // 🧱 PATRÓN ensureExists: usuario inexistente → 404 (antes era 400)
      return await ensureExists(this.userRepository, id, 'El usuario');
    } catch (error) {
      handleServiceError(this.logger, error, 'No se pudo buscar el usuario');
    }
  }

  // Actualizar usuario
  async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    try {
      // 🧱 PATRÓN ensureExists: usuario inexistente → 404 (antes era 400)
      const user = await ensureExists(this.userRepository, id, 'El usuario');

      // 🔒 SEGURIDAD: Si viene password en el Body, la hasheamos antes de pisar el objeto
      if (updateUserDto.password) {
        updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
        // 🔒 SEGURIDAD (punto 15): cambiar el password revoca todas las
        // sesiones activas del usuario
        user.tokenVersion = (user.tokenVersion ?? 0) + 1;
      }

      // Usamos Object.assign para actualizar solo los campos que vienen en el DTO
      Object.assign(user, updateUserDto);

      // (F8): si un usuario de Google completa su perfil (define contraseña
      // local y tiene teléfono), se limpia el flag
      if (user.profileIncomplete && updateUserDto.password && user.phone) {
        user.profileIncomplete = false;
      }

      return await this.userRepository.save(user);
    } catch (error) {
      // 🧱 PATRÓN unique violation → 409: el único unique de la entidad es
      // el email; si el update lo pisa con uno ya usado, respondemos claro
      // (sin revelar de quién es)
      if (isUniqueViolation(error)) {
        throw new ConflictException('Ese email no está disponible');
      }
      handleServiceError(this.logger, error, 'No se pudo actualizar el usuario');
    }
  }

  // Eliminar usuario
async deleteUser(id: number): Promise<void> {
  try {
    // 1. Verificar que existe — 🧱 ensureExists: inexistente → 404 (antes 400)
    const user = await ensureExists(this.userRepository, id, 'El usuario');

    // 2. Borrar sus property_requests primero
    await this.propertyRequestRepository.delete({ userId: id });

    // 3. Ahora sí borrar el usuario
    await this.userRepository.delete(id);

    // 4. Limpiar foto de Cloudinary — best-effort (ERROR_FIXES R-18): el
    // usuario YA se borró; un fallo acá no debe devolver error al cliente
    if (user.photo) {
      const publicId = `userPhotoProfile/user_${id}`;
      try {
        await this.cloudinaryService.deleteFile(publicId);
      } catch (cleanupError) {
        this.logger.error(
          `No se pudo limpiar la foto de perfil ${publicId} en Cloudinary`,
          cleanupError instanceof Error ? cleanupError.stack : String(cleanupError),
        );
      }
    }
  } catch (error) {
    handleServiceError(this.logger, error, 'No se pudo eliminar el usuario');
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
