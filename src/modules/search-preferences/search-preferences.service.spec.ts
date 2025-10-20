import { Test, TestingModule } from '@nestjs/testing';
import { SearchPreferencesService } from './search-preferences.service';

describe('SearchPreferencesService', () => {
  let service: SearchPreferencesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchPreferencesService],
    }).compile();

    service = module.get<SearchPreferencesService>(SearchPreferencesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
