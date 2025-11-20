import { IsNotEmpty, IsString, IsNumber } from 'class-validator';

export class CreatePropertyImageDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsNumber()
  @IsNotEmpty()
  propertyId: number;
}
