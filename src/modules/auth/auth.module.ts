import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GoogleAuthService } from './google.auth.service';

@Module({
  // 'imports' configura todos los módulos que proporcionan funcionalidad
  // o datos necesarios para el proceso de autenticación.
  imports:[
    // Proporciona la infraestructura base para "enchufar" estrategias de autenticación (como JWT).
    PassportModule,

    // Flujo: registerAsync le dice a NestJS: "Espera a que el ConfigService esté listo (puede tardar unmomento), luego inyéctalo en useFactory, y solo después configura el JwtModule."

    JwtModule.registerAsync({
      // Importamos explícitamente ConfigModule para que NestJS sepa que necesitamos
      // inyectar ConfigService en la fábrica (useFactory) antes de configurarlo.
      imports: [ConfigModule], 

      // 'useFactory' es la función que se ejecuta para crear la configuración del módulo.
      useFactory: async (configService: ConfigService) => {
        return { 
          // 🔑 Clave Secreta: Obtenida del ConfigService (lee el .env). 
          // Es vital para firmar tokens y asegurar que solo nuestro backend pueda verificarlos.
          secret: configService.get<string>('JWT_SECRET') || 'FALLBACK_SECRET',
          signOptions:{ 
            // Tiempo de Expiración: También del .env. 
            // Define por cuánto tiempo el token será válido.
            expiresIn: configService.get('JWT_EXPIRATION_TIME') || "24h"
          }
        };
      },
      // 'inject' le dice a NestJS qué dependencia inyectar en la función 'useFactory'.
      inject: [ConfigService], 
    }),

    // Se importa UsersModule para poder acceder a los proveedores (ej: UserService)
    // que AuthModule necesita para verificar las credenciales del usuario durante el login.
    UsersModule
  ],

  // 'controllers' son los puntos de entrada HTTP (ej: /auth/login, /auth/register).
  controllers: [AuthController], 

  // 'providers' son la lógica de negocio (Servicios) y los componentes de verificación (Estrategias).
  providers: [
    AuthService, // Lógica para el login/registro y GENERACIÓN del token.
    JwtStrategy,  // Lógica para la VERIFICACIÓN y validación del token en rutas protegidas.
    GoogleAuthService,
  ],
})

export class AuthModule {}