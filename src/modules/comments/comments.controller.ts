import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '../users/enums/role.enum';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('properties/:propertyId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  // -----------------------------------------------------
  // CREATE COMMENT
  // -----------------------------------------------------
  @Roles(Role.USER)
  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(
    @Param('propertyId') propertyId: number,
    @Req() req,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(+propertyId, req.user.id, dto);
  }

  // -----------------------------------------------------
  // GET COMMENTS FOR PROPERTY
  // -----------------------------------------------------
  @Get()
  findByProperty(@Param('propertyId') propertyId: number) {
    return this.commentsService.findByProperty(+propertyId);
  }

  // -----------------------------------------------------
  // UPDATE COMMENT (OWNER ONLY)
  // -----------------------------------------------------
  @UseGuards(AuthGuard('jwt'))
  @Patch(':commentId')
  update(
    @Param('commentId') commentId: number,
    @Req() req,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.commentsService.update(+commentId, req.user.id, dto);
  }

  // -----------------------------------------------------
  // DELETE COMMENT (OWNER OR ADMIN)
  // -----------------------------------------------------
  @UseGuards(AuthGuard('jwt'))
  @Delete(':commentId')
  remove(
    @Param('commentId') commentId: number,
    @Req() req,
  ) {
    return this.commentsService.remove(
      +commentId,
      req.user.id,
      req.user.role === Role.ADMIN,
    );
  }
}
