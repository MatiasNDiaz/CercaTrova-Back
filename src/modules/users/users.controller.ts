// src/modules/users/users.controller.ts
import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  UseInterceptors, UploadedFile, UseGuards, Request, ForbiddenException, Res
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { imageUploadOptions } from 'src/common/multer/image-upload.options';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'; // Ajustá la ruta según tu proyecto
import { RolesGuard } from 'src/common/guards/roles.guard'; // Ajustá la ruta
import { Roles } from 'src/common/decorators/roles.decorator'; // Ajustá la ruta
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { Role } from './enums/role.enum';
import { clearAuthCookie } from '../auth/auth-cookie.helper';
import type { Response } from 'express';

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
  // 🔒 SEGURIDAD (M12): solo imágenes, máx. 5 MB
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
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

  // 5.a (F7). Perfil propio: el id sale SIEMPRE del token — sin param de
  // URL no hay superficie de IDOR. Declarada antes que ':id' para que
  // 'me' no matchee como id.
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateOwnProfile(
    @GetUser('id') userId: number,
    @Body() updateUserDto: UpdateUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    const updated = await this.usersService.updateUser(userId, updateUserDto);
    // Cambiar el password revoca la sesión (tokenVersion++) — esta misma
    // respuesta todavía viaja con el token viejo, así que la limpiamos acá
    // en vez de dejar que el cliente se entere recién con un 401 en el
    // próximo request (ver nota en updateUser() más abajo sobre por qué
    // esto no aplica cuando quien edita es un ADMIN sobre otro usuario).
    if (updateUserDto.password) clearAuthCookie(res);
    return updated;
  }

  // 5.b Actualizar Datos: Solo el dueño de la cuenta o Admin
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    const isSelf = req.user.id === Number(id);
    if (!isSelf && req.user.role !== Role.ADMIN) {
      throw new ForbiddenException('No tienes permiso para actualizar este usuario');
    }
    const updated = await this.usersService.updateUser(Number(id), updateUserDto);
    // Solo limpiamos la cookie de ESTA respuesta si quien llamó es el mismo
    // usuario que cambió su password (isSelf). Si es un ADMIN editando la
    // cuenta de otro, la cookie que viajaría acá es la del ADMIN — limpiarla
    // cerraría la sesión del admin, no la del usuario afectado (esa sesión
    // vive en otro navegador al que esta response no tiene acceso; su token
    // ya quedó revocado igual por el tokenVersion++ del service).
    if (isSelf && updateUserDto.password) clearAuthCookie(res);
    return updated;
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