import { Controller, Get, Post, Body, Param, Patch, Delete } from '@nestjs/common';
import { TypeOfPropertyService } from './typeOfProperty.service';
import { CreateTypeOfPropertyDto } from './dto/create-type-of-property.dto';
import { UpdateTypeOfPropertyDto } from './dto/update-type-of-property.dto';

@Controller('property-types')
export class TypeOfPropertyController {
  constructor(private readonly service: TypeOfPropertyService) {}

  @Post()
  create(@Body() dto: CreateTypeOfPropertyDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTypeOfPropertyDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
