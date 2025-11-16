// src/modules/users/dto/create-user.dto.ts
import { Transform } from 'class-transformer';
import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { Role } from '../enums/role.enum';

export class CreateUserDto {

  @Transform(({value}) => {value?.trim()})
  @IsString()
  name: string;

  @Transform(({value}) => {value?.trim()})
  @IsString()
  surname: string;
  
  @Transform(({value}) => {value?.trim()})
  @IsString() // Mejor usar string por posibles ceros o códigos de país
  phone: string;

  @IsOptional()
  @IsString()
  photo?: string;

  @Transform(({ value }) => value?.trim().toLowerCase())
  @IsEmail()
  email: string;
  
  @Transform(({value}) => {value?.trim()})
  @IsString()
  password: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

}
