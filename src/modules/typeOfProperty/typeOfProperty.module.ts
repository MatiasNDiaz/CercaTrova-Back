import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOfPropertyService } from './typeOfProperty.service';
import { TypeOfPropertyController } from './typeOfProperty.controller';
import { PropertyType } from './entities/typeOfProperty.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PropertyType])],
  controllers: [TypeOfPropertyController],
  providers: [TypeOfPropertyService],
  exports: [TypeOrmModule],
})
export class TypeOfPropertyModule {}
