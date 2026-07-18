import { BadRequestException, Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login-auth.dto';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../users/enums/role.enum';
import { NotificationService } from '../notifications/notifications.service';
import { GoogleAuthService } from './google.auth.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
    private readonly jwtService: JwtService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly notificationService: NotificationService,
  ) {}

  async register(registerData: CreateUserDto) {
    // 🔒 SEGURIDAD (B1): mensaje genérico — no revelar si el email existe
    const userExist = await this.userService.findUserByEmail(registerData.email);
    if (userExist) throw new BadRequestException('No se pudo completar el registro. Verificá los datos ingresados.');

    // 🔒 SEGURIDAD (C2): el hash lo hace UsersService.createUser() (única
    // fuente de verdad). Hashear acá también produciría un doble hash.
    const createdUser = await this.userService.createUser(registerData);

    // 👇 ahora pasa el id también
    this.notificationService
      .notifyAdminNewUser({
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
      })
      .catch((err) => console.error('[NOTIF ADMIN] Error notificando nuevo usuario:', err));

    const { password, ...userWithoutPass } = createdUser;
    return userWithoutPass;
  }

  async login(loginData: LoginDto) {
    // 🔒 SEGURIDAD (C8): única query del sistema que carga el hash del password
    const userExist = await this.userService.findUserByEmailWithPassword(loginData.email);
    if (!userExist) throw new BadRequestException('Credenciales inválidas');

    // 🔒 SEGURIDAD (B1): usuario de Google sin contraseña local — mismo
    // mensaje genérico para no revelar el método de registro de un email ajeno
    if (!userExist.password) {
      throw new BadRequestException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(loginData.password, userExist.password);
    if (!isPasswordValid) throw new BadRequestException('Credenciales inválidas');

    // 🔒 SEGURIDAD (punto 15): el JWT incluye tokenVersion para revocación
    const payload = {
      email: userExist.email,
      sub: userExist.id,
      role: userExist.role,
      tokenVersion: userExist.tokenVersion ?? 0,
    };
    const token = this.jwtService.sign(payload);

    const { password, ...userWithoutPass } = userExist;
    return { token, user: userWithoutPass };
  }

  async googleLogin(idToken: string) {
    const googleUser = await this.googleAuthService.verifyIdToken(idToken);

    let user = await this.userService.findUserByEmail(googleUser.email);
    const isNewUser = !user;

    if (!user) {
      const partialUser: CreateUserDto = {
        name: googleUser.name || 'Nombre',
        surname: googleUser.surname || 'Apellido',
        email: googleUser.email,
        photo: googleUser.photo,
        password: '',
        phone: '',
        // El rol NO se pasa: la entidad lo asigna por default (Role.USER)
      };
      // (F8): los usuarios creados vía Google arrancan sin teléfono ni
      // contraseña local → profileIncomplete = true (el frontend debe
      // guiarlos a completar el perfil)
      user = await this.userService.createUser(partialUser, true);
      // Los defaults de la entidad los aplica la DB, pero save() no los
      // devuelve: los fijamos para que el payload del JWT y la respuesta
      // tengan los valores reales
      if (!user.role) user.role = Role.USER;
      if (user.tokenVersion == null) user.tokenVersion = 0;
    }

    // 👇 ahora pasa el id también
    if (isNewUser) {
      this.notificationService
        .notifyAdminNewUser({
          id: user.id,
          name: user.name,
          email: user.email,
        })
        .catch((err) => console.error('[NOTIF ADMIN] Error notificando usuario Google:', err));
    }

    // 🔒 SEGURIDAD (punto 15): el JWT incluye tokenVersion para revocación
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    };
    const token = this.jwtService.sign(payload);

    const { password, ...userWithoutPass } = user;
    return { token, user: userWithoutPass };
  }

  // 🔒 SEGURIDAD (punto 15): logout real — incrementa tokenVersion e
  // invalida todos los tokens emitidos hasta ahora para este usuario
  async logout(userId: number): Promise<void> {
    await this.userService.incrementTokenVersion(userId);
  }

  async getMe(userId: number) {
    const user = await this.userService.getUserById(userId);
    if (!user) throw new BadRequestException('Usuario no encontrado');
    const { password, ...userWithoutPass } = user;
    return userWithoutPass;
  }
}