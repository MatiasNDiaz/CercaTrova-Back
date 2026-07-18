import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import { ConfigModule } from '@nestjs/config';
import { FailedEmail } from './entities/failed-email.entity';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([FailedEmail])],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
