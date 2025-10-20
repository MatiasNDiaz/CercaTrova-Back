import { PartialType } from '@nestjs/mapped-types';
import { CreateSearchPreferenceDto } from './create-search-preference.dto';

export class UpdateSearchPreferenceDto extends PartialType(CreateSearchPreferenceDto) {}
