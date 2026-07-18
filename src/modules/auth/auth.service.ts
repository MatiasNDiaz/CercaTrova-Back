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
    const userExist = await this.userService.findUserByEmail(registerData.email);
    if (userExist) throw new BadRequestException('Usuario ya existente');

    const hashedPassword = await bcrypt.hash(registerData.password, 10);
    registerData.password = hashedPassword;

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
    const userExist = await this.userService.findUserByEmail(loginData.email);
    if (!userExist) throw new BadRequestException('Credenciales inválidas');

    if (!userExist.password) {
      throw new BadRequestException(
        'Este usuario se registró con Google y no tiene contraseña',
      );
    }

    const isPasswordValid = await bcrypt.compare(loginData.password, userExist.password);
    if (!isPasswordValid) throw new BadRequestException('Credenciales inválidas');

    const payload = { email: userExist.email, sub: userExist.id, role: userExist.role };
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
        role: Role.USER,
      };
      user = await this.userService.createUser(partialUser);
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

    const payload = { email: user.email, sub: user.id, role: user.role };
    const token = this.jwtService.sign(payload);

    const { password, ...userWithoutPass } = user;
    return { token, user: userWithoutPass };
  }

  async getMe(userId: number) {
    const user = await this.userService.getUserById(userId);
    if (!user) throw new BadRequestException('Usuario no encontrado');
    const { password, ...userWithoutPass } = user;
    return userWithoutPass;
  }
}