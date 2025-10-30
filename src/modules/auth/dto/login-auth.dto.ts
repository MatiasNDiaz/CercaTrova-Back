// src/modules/users/dto/create-user.dto.ts
import { IsString, IsEmail, IsOptional, IsBoolean, IsDate, IsNumber, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {

    @IsOptional() // Se genera automáticamente en la DB
    @IsNumber()
    id?: number;

    @Transform(({ value }) => value.trim().toLowerCase())
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(5)
    password: string;
}