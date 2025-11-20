import { IsString, MinLength } from 'class-validator';

export class CreateTypeOfPropertyDto {
  @IsString()
  @MinLength(3)
  name: string;
}
