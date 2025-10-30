import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports:[
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule], 
      useFactory: async (configService: ConfigService) => {
        
        // Al no usar Promise<...> en useFactory, NestJS infiere mejor los tipos
        return { // <-- Quitar el "async" de la función y envolver en return si es necesario
          secret: configService.get<string>('JWT_SECRET') || 'FALLBACK_SECRET',
          signOptions:{ 
            // Aquí el tipo del valor que se espera es 'string' (ej: '24h'),
            // pero TypeScript es muy estricto con la inferencia. 
            expiresIn: configService.get('JWT_EXPIRATION_TIME') || "24h"
          }
        };
      },
      inject: [ConfigService], 
    }),
    UsersModule
  ],
  controllers: [AuthController], 
  providers: [
    AuthService,
    JwtStrategy
  ],
})

export class AuthModule {}