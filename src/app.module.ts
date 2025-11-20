import { Module } from '@nestjs/common';
import { UsersModule } from './modules/users/users.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { RequestsModule } from './modules/requests/requests.module';
import { AuthModule } from './modules/auth/auth.module';
import { typeOrmConfig } from './config/typeorm.config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { BootstrapService } from './common/bootstraps/bootstrap.service';
import { User } from './modules/users/entities/user.entity';
import { TypeOfPropertyModule } from './modules/typeOfProperty/typeOfProperty.module';

@Module({
  // La propiedad 'imports' define los módulos que este módulo necesita.
  imports: [
    // ----------------------------------------------------------------------
    // 1. CONFIGURACIÓN GLOBAL (Variables de Entorno)
    // ----------------------------------------------------------------------
    ConfigModule.forRoot({
      // 📝 FUNCIÓN: Carga las variables del archivo .env al inicio de la app.
      // 'isGlobal: true' hace que el ConfigService (lector de variables)
      // pueda ser inyectado en cualquier otro módulo de la aplicación sin reimportarlo.
      isGlobal: true,  
    }),

    // ----------------------------------------------------------------------
    // 2. CONEXIÓN A LA BASE DE DATOS (TypeORM)
    // ----------------------------------------------------------------------
    TypeOrmModule.forRoot(typeOrmConfig),
      TypeOrmModule.forFeature([User]),
    // 📝 FUNCIÓN: Establece la conexión principal a la Base de Datos.
    // 'forRoot' inicializa TypeORM con la configuración de conexión
    // (credenciales, tipo de DB, etc.) definida en 'typeOrmConfig'.

    // ----------------------------------------------------------------------
    // 3. MÓDULOS DE FUNCIONALIDAD (Feature Modules)
    // ----------------------------------------------------------------------
    // Estos módulos contienen los controladores, servicios y lógica de negocio
    // encapsulando cada funcionalidad de la inmobiliaria.
    UsersModule, 
    PropertiesModule, 
    RequestsModule, 
    AuthModule,
    TypeOfPropertyModule
  ],
  providers: [BootstrapService],
  // Nota: Al ser el módulo raíz, no necesita 'controllers' ni 'providers' propios,
  // y rara vez tiene 'exports'.
})
export class AppModule {}