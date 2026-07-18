// src/modules/ratings/dto/create-rating.dto.ts
import { IsInt, Min, Max } from 'class-validator';

// (B5): DTO para POST /ratings/:propertyId — antes se usaba @Body('score')
// suelto sin validación de tipo (un string numérico pasaba de largo)
export class CreateRatingDto {
  @IsInt()
  @Min(1)
  @Max(5)
  score: number;
}
