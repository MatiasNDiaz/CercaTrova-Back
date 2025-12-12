import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsBoolean()
  read?: boolean = false;
}
