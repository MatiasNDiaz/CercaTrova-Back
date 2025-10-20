import { Module } from '@nestjs/common';
import { SearchPreferencesService } from './search-preferences.service';
import { SearchPreferencesController } from './search-preferences.controller';

@Module({
  controllers: [SearchPreferencesController],
  providers: [SearchPreferencesService],
})
export class SearchPreferencesModule {}
