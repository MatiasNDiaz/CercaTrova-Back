import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe, Req } from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '../users/enums/role.enum';

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}
    @Roles(Role.USER)
    @Post(':propertyId')
    @UseGuards(JwtAuthGuard) 
  async rate(
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @Body('score') score: number,
    @Req() req
  ) {
  const userId = req.user.id;
  return this.ratingsService.rateProperty(userId, propertyId, score);
  }
}
