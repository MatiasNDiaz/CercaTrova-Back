import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOfPropertyService } from './typeOfProperty.service';
import { TypeOfPropertyController } from './typeOfProperty.controller';
import { PropertyType } from './entities/typeOfProperty.entity';
import { Property } from '../properties/entities/property.entity';

@Module({
  // Property se registra para chequear que un tipo no esté en uso antes de borrarlo
  imports: [TypeOrmModule.forFeature([PropertyType, Property])],
  controllers: [TypeOfPropertyController],
  providers: [TypeOfPropertyService],
  exports: [TypeOrmModule],
})
export class TypeOfPropertyModule {}
