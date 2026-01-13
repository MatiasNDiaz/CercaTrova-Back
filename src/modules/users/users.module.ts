import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { BootstrapService } from 'src/common/bootstraps/bootstrap.service';
import { CloudinaryModule } from 'src/common/Cloudinary/cloudinary.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), CloudinaryModule], // <-- esto es clave
  providers: [UsersService, BootstrapService],
  controllers: [UsersController],
  exports: [UsersService], // opcional, si otro módulo necesita el servicio
})
export class UsersModule {}