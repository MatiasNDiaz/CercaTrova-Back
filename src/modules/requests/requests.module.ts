import { Module } from '@nestjs/common';
import { UserSearchFeedbackService } from './requests.service';
import { UserSearchFeedbackController } from './requests.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSearchFeedback } from './entities/request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserSearchFeedback])],

  controllers: [UserSearchFeedbackController],
  providers: [UserSearchFeedbackService],
  exports: [UserSearchFeedbackService],
})
export class RequestsModule {}
