import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { RatingsModule } from './modules/ratings/ratings.module';
import { Favorite } from './modules/favorites/entities/favorite.entity';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { Stat } from './modules/stats/entities/stat.entity';
import { StatsModule } from './modules/stats/stats.module';
import { CommentsModule } from './modules/comments/comments.module';
import { EmailModule } from './modules/notifications/email/email.module';
import { NotificationModule } from './modules/notifications/notifications.module';
import { SearchPreferencesModule } from './modules/search-preferences/search-preferences.module';
import { PropertyRequestModule } from './modules/PropertyRequest/propertyRequest.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PostsModule } from './modules/posts/posts.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { StatisticsModule } from './modules/statistics/statistics.module';
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

    // 🔒 SEGURIDAD (M9): rate limiting global — 100 requests/min por IP.
    // Las rutas de auth tienen un límite estricto propio (5/min) vía
    // @Throttle en auth.controller.ts.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
    }),

    // ⏰ Tareas programadas. Hoy la única es el borrado automático de
    // publicaciones vencidas (`PostsCleanupService`), a las 3am.
    ScheduleModule.forRoot(),
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
    TypeOfPropertyModule,
    RatingsModule,
    FavoritesModule,
    StatsModule,
    CommentsModule,
    EmailModule,
    NotificationModule,
    SearchPreferencesModule,
    PropertyRequestModule,
    PostsModule,
    TrackingModule,
    StatisticsModule,
  ],
  providers: [
    BootstrapService,
    // 🔒 SEGURIDAD (M9): aplica el rate limiting a TODA la app
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  // Nota: Al ser el módulo raíz, no necesita 'controllers' ni 'providers' propios,
  // y rara vez tiene 'exports'.
})
export class AppModule {}