import { IsNotEmpty, IsNumber } from 'class-validator';

export class UploadImagesDto {
  @IsNumber()
  @IsNotEmpty()
  propertyId: number;
}
