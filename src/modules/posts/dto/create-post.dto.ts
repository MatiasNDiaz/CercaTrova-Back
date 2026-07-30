import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * La IMAGEN no va acá: viaja como archivo por `FileInterceptor`, igual que en
 * `properties.controller.ts`. Este DTO solo lleva el texto.
 */
export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description: string;
}
