import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';


@Controller('users') // Esto define la ruta base: /users
export class UsersController {
  constructor(private readonly usersService: UsersService) {} // Inyectamos el servicio

  @Post() // Define un endpoint POST en la ruta /users
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    // @Body() indica que NestJS debe tomar los datos enviados en el body del request
    return this.usersService.createUser(createUserDto); 
    // Llama al servicio para crear el usuario y retorna el resultado
  }

  @Get() // Define un endpoint Get en la ruta /users
  async getAllUsers(): Promise<User[]> {
    return this.usersService.getAllUsers(); 
    // Llama al servicio para obtener los usuarios y retorna el resultado
  }

  @Get(':id') // Endpoint GET /users/:id
    async getUserById(@Param('id') id: string): Promise<User | null> {
    return this.usersService.getUserById(Number(id));
  }

  @Patch(':id') // PATCH /users/:id
    async updateUser(
      @Param('id') id: string,
      @Body() updateUserDto: UpdateUserDto
    ): Promise<User> {
      return this.usersService.updateUser(Number(id), updateUserDto);
  } 

  @Delete(':id') // DELETE /users/:id
    async deleteUser(@Param('id') id: string): Promise<{ message: string }> {
    await this.usersService.deleteUser(Number(id));
    return { message: 'Usuario eliminado correctamente' };
  }

}
