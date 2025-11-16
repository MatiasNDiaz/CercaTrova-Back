import { BadRequestException, Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login-auth.dto';
import { JwtService } from '@nestjs/jwt';


@Injectable()
export class AuthService {
  constructor(
    private readonly userService:UsersService,
    private readonly jwtService: JwtService
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
}
