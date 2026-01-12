import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertyRequest } from './entities/PropertyRequest';
import { PropertyRequestService } from './propertyRequest.service';
import { PropertyRequestController } from './propertyRequest.controller';
import { PropertiesModule } from '../properties/properties.module';

@Module({
  imports: [TypeOrmModule.forFeature([PropertyRequest]), PropertiesModule], // Registramos la entidad
  controllers: [PropertyRequestController],
  providers: [PropertyRequestService],
  exports: [PropertyRequestService], // Lo exportamos por si lo necesitamos en el módulo de Properties
})
export class PropertyRequestModule {}