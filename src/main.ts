import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { BootstrapService } from './common/bootstraps/bootstrap.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,      // elimina propiedades extras que se envien desde el body, que no están en el DTO
    forbidNonWhitelisted: true, // lanza error si hay propiedades extra
    transform: true       // convierte JSON en instancias de clases
  }));
  
  const bootstrapService = app.get(BootstrapService);
  await bootstrapService.createDefaultAdmin(); // 👈 CREA EL ADMIN
  
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
