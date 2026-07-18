import { IsString, IsEmail, IsOptional, IsBoolean } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  surname?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  photo?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  password?: string;

  // 📧 (M8): opt-out de emails masivos — editable por el propio usuario
  // vía PATCH /users/:id (futuro toggle en el perfil)
  @IsOptional()
  @IsBoolean()
  notifyBroadcast?: boolean;

  // 🔒 SEGURIDAD (B7): el campo isAdmin fue eliminado — no existía en la
  // entidad y era una mina de escalada de privilegios futura. El rol jamás
  // debe ser editable desde este DTO.
}
