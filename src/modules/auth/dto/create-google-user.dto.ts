// src/modules/users/dto/create-user.dto.ts
import { IsString, IsEmail, IsOptional, IsBoolean, IsDate, IsNumber, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateGoogleUserDto {
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsOptional()
  name?: string;

  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsOptional()
  surname?: string;

  @Transform(({ value }) => value?.trim())
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  photo?: string;
}
