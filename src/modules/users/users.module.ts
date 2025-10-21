import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])], // <-- esto es clave
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService], // opcional, si otro módulo necesita el servicio
})
export class UsersModule {}