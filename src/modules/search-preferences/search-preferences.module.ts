import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchPreferencesService } from './search-preferences.service';
import { SearchPreferencesController } from './search-preferences.controller';
import { SearchPreference } from './entities/search-preference.entity';
import { UsersModule } from '../users/users.module';
import { PropertyType } from '../typeOfProperty/entities/typeOfProperty.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SearchPreference, PropertyType]),
    UsersModule,
  ],
  controllers: [SearchPreferencesController],
  providers: [SearchPreferencesService],
  exports: [SearchPreferencesService], // opcional
})
export class SearchPreferencesModule {}
