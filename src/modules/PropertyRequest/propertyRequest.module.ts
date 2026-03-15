import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertyRequest } from './entities/PropertyRequest';
import { PropertyRequestService } from './propertyRequest.service';
import { PropertyRequestController } from './propertyRequest.controller';
import { PropertiesModule } from '../properties/properties.module';
import { NotificationModule } from '../notifications/notifications.module'; // ← agregar

@Module({
  imports: [
    TypeOrmModule.forFeature([PropertyRequest]),
    PropertiesModule,
    NotificationModule, // ← agregar
  ],
  controllers: [PropertyRequestController],
  providers: [PropertyRequestService],
  exports: [PropertyRequestService],
})
export class PropertyRequestModule {}