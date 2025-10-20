import { Test, TestingModule } from '@nestjs/testing';
import { SearchPreferencesController } from './search-preferences.controller';
import { SearchPreferencesService } from './search-preferences.service';

describe('SearchPreferencesController', () => {
  let controller: SearchPreferencesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchPreferencesController],
      providers: [SearchPreferencesService],
    }).compile();

    controller = module.get<SearchPreferencesController>(SearchPreferencesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
