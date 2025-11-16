import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register-auth.dto';
import { LoginDto } from './dto/login-auth.dto';


@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
    register(@Body() registerData: RegisterDto) {
    return this.authService.register(registerData)
  }

  @Post("login") 
    login(@Body() loginData:LoginDto){
    return this.authService.login(loginData)

  }
}