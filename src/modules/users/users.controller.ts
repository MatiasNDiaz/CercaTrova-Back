// src/modules/users/users.controller.ts
import { 
  Controller, Get, Post, Patch, Delete, Body, Param, 
  UseInterceptors, UploadedFile, UseGuards, Request, ForbiddenException 
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'; // Ajustá la ruta según tu proyecto
import { RolesGuard } from 'src/common/guards/roles.guard'; // Ajustá la ruta
import { Roles } from 'src/common/decorators/roles.decorator'; // Ajustá la ruta
import { Role } from './enums/role.enum';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 1. Registro: Público (Sin Guards)
  @Post()
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.createUser(createUserDto);
  }

  // 2. Subir Foto: Solo usuarios logueados
  @Patch(':id/photo')
  @UseGuards(JwtAuthGuard) 
  @UseInterceptors(FileInterceptor('file'))
  async uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    // Seguridad: Un usuario no puede cambiar la foto de otro
    if (req.user.id !== Number(id) && req.user.role !== Role.ADMIN) {
      throw new ForbiddenException('No tienes permiso para editar este perfil');
    }
    return this.usersService.updateProfilePhoto(Number(id), file);
  }

  // 3. Ver todos: Solo Admin
  @Get()
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getAllUsers(): Promise<User[]> {
    return this.usersService.getAllUsers();
  }

  // 4. Ver perfil individual: Solo logueados
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getUserById(@Param('id') id: string): Promise<User | null> {
    return this.usersService.getUserById(Number(id));
  }

  // 5. Actualizar Datos: Solo el dueño de la cuenta o Admin
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req,
  ): Promise<User> {
    if (req.user.id !== Number(id) && req.user.role !== Role.ADMIN) {
      throw new ForbiddenException('No tienes permiso para actualizar este usuario');
    }
    return this.usersService.updateUser(Number(id), updateUserDto);
  }

  // 6. Eliminar: Solo ADMIN
  @Delete(':id')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async deleteUser(@Param('id') id: string): Promise<{ message: string }> {
    await this.usersService.deleteUser(Number(id));
    return { message: 'Usuario eliminado correctamente por el administrador' };
  }
}