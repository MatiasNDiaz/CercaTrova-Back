import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards } from '@nestjs/common';
import { TypeOfPropertyService } from './typeOfProperty.service';
import { CreateTypeOfPropertyDto } from './dto/create-type-of-property.dto';
import { UpdateTypeOfPropertyDto } from './dto/update-type-of-property.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { Role } from '../users/enums/role.enum';

// 🔒 SEGURIDAD (C3): el CRUD completo era público. Escrituras solo-ADMIN;
// las lecturas quedan @Public() porque el frontend las usa para dropdowns.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('property-types')
export class TypeOfPropertyController {
  constructor(private readonly service: TypeOfPropertyService) {}

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateTypeOfPropertyDto) {
    return this.service.create(dto);
  }

  @Public()
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTypeOfPropertyDto) {
    return this.service.update(+id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
