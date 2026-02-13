import { BadRequestException, Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login-auth.dto';
import { JwtService } from '@nestjs/jwt';
import { CreateGoogleUserDto } from './dto/create-google-user.dto';
import { Role } from '../users/enums/role.enum';
import { GoogleAuthService } from './google.auth.service';


@Injectable()
export class AuthService {
  constructor(
    private readonly userService:UsersService,
    private readonly jwtService: JwtService,
    private readonly googleAuthService: GoogleAuthService
  ){}

  // REGISTER
  async register(registerData: CreateUserDto) {
    // validacion de usuario existente
    const userExist = await this.userService.findUserByEmail(registerData.email)
    if(userExist) throw new BadRequestException("Usuario ya existente");

    // Encriptar la contraseña del usuario
    const hashedPassword = await bcrypt.hash(registerData.password, 10);
    registerData.password = hashedPassword;

    // creamos el usuario llamando la funcion de crear el usuario de userService
    const createdUser = await this.userService.createUser(registerData);
    
    // Oculatamos la contraseña para que no quede a la vista 
    const {password, ...userWithoutPass} = createdUser

    // retornamos el usuario sin la contraseña
    return userWithoutPass
  }

  // LOGIN
  async login(loginData: LoginDto) {
  const userExist = await this.userService.findUserByEmail(loginData.email);
  if (!userExist) throw new BadRequestException("Credenciales inválidas");

  if (!userExist.password) {
    throw new BadRequestException(
      "Este usuario se registró con Google y no tiene contraseña"
    );
  }

  const isPasswordValid = await bcrypt.compare(loginData.password, userExist.password);
  if (!isPasswordValid) throw new BadRequestException("Credenciales inválidas");

  const payload = { email: userExist.email, sub: userExist.id, role: userExist.role };
  const token = this.jwtService.sign(payload);

  const { password, ...userWithoutPass } = userExist;
  return { token, user: userWithoutPass }; // ✅ cambio clave
}
// LOGIN CON GOOGLE
async googleLogin(idToken: string) {
  const googleUser = await this.googleAuthService.verifyIdToken(idToken);

  let user = await this.userService.findUserByEmail(googleUser.email);
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

  const payload = { email: user.email, sub: user.id, role: user.role };
  const token = this.jwtService.sign(payload);

  const { password, ...userWithoutPass } = user;
  return { token, user: userWithoutPass }; // ✅ cambio clave
}

}
