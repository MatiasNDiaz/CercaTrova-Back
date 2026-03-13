import { Controller, Get, Post, Body, Patch, Param, Delete, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register-auth.dto';
import { LoginDto } from './dto/login-auth.dto';
// import { CreateGoogleUserDto } from './dto/create-google-user.dto';
import { UseGuards, Req } from '@nestjs/common'; // agregá estos imports
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'; // ajustá el path
import type { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
    register(@Body() registerData: RegisterDto) {
    return this.authService.register(registerData)
  }

  @Post('login')
async login(@Body() loginData: LoginDto, @Res({ passthrough: true }) res: Response) {
  const { token, user } = await this.authService.login(loginData);
  res.cookie('access_token', token, { httpOnly: true, secure: false, maxAge: 24*60*60*1000 });
  return { message: 'Login exitoso', user };
}

@Post('google')
async googleLogin(@Body('idToken') idToken: string, @Res({ passthrough: true }) res: Response) {
  const { token, user } = await this.authService.googleLogin(idToken);
  res.cookie('access_token', token, { httpOnly: true, secure: false, maxAge: 24*60*60*1000 });
  return { message: 'Login con Google exitoso', user };
}


  // 👇 FIX: busca el usuario completo en la DB usando el sub (id) del token
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: any) {
    return this.authService.getMe(req.user.id);
  }

  
@Post('logout')
logout(@Res({ passthrough: true }) res: Response) {
  res.clearCookie('access_token', {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === "production"
});// 👈 borra la cookie del browser
  return { message: 'Logout exitoso' };
}

}