import { Module } from '@nestjs/common';
import { UsersModule } from './modules/users/users.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { RequestsModule } from './modules/requests/requests.module';
import { AuthModule } from './modules/auth/auth.module';
import { typeOrmConfig } from './config/typeorm.config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Hace que ConfigService esté disponible en toda la aplicación
    }),
    TypeOrmModule.forRoot(typeOrmConfig), 
    UsersModule, 
    PropertiesModule, 
    RequestsModule, 
    AuthModule],
})
export class AppModule {}
