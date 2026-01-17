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
  async login(loginData:LoginDto){

    // validacion de usuario existente
    const userExist = await this.userService.findUserByEmail(loginData.email)
    if(!userExist) throw new BadRequestException("Credenciales Invalidas");
   
    // ⚠️ Solo validamos contraseña si existe
    if (!userExist.password) {
    throw new BadRequestException(
      "Este usuario se registró con Google y no tiene contraseña"
      );
    }
    // comparamos la contraseña que envíe el usuario al loguearse, con la contraseña que está hasheada en la base de datos del mismo usaurio
    const isPasswordValid = await bcrypt.compare(loginData.password, userExist.password)
    if (!isPasswordValid) throw new BadRequestException("Credenciales inválidas");

    const payload = { 
      email: userExist.email, 
      sub: userExist.id,
      role: userExist.role 
    };

    // 
    const token = this.jwtService.sign(payload);

    const { password, ...userWithoutPass } = userExist;
    
    return {
      message: "Login exitoso",
      user: userWithoutPass,
      token,
      typ: 'access'
    }
  }

  async googleLogin(idToken: string) {
  // 1️⃣ Verificamos el token con Google
  const googleUser = await this.googleAuthService.verifyIdToken(idToken);

  // 2️⃣ Buscamos usuario por email
  let user = await this.userService.findUserByEmail(googleUser.email);

  // 3️⃣ Si no existe → creamos usuario parcial
  if (!user) {
    const partialUser: CreateUserDto = {
      name: googleUser.name || 'Nombre',
      surname: googleUser.surname || 'Apellido',
      email: googleUser.email,
      photo: googleUser.photo,
      password: '',  // o null si DB lo permite
      phone: '',     // rellenás vacío
      role: Role.USER,
    };
    user = await this.userService.createUser(partialUser);
  }

  // 4️⃣ Generar JWT o cookie
  const payload = { email: user.email, sub: user.id, role: user.role };
  const token = this.jwtService.sign(payload);

  const { password, ...userWithoutPass } = user;
  return {
    message: 'Login con Google exitoso',
    user: userWithoutPass,
    token,
    typ: 'access',
  };
}
}
