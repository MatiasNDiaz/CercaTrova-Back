import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Property } from '../properties/entities/property.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>,

    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // -----------------------------------------------------
  // CREATE COMMENT
  // -----------------------------------------------------
  async create(propertyId: number, userId: number, dto: CreateCommentDto) {
    const property = await this.propertyRepo.findOne({
      where: { id: propertyId },
    });
    if (!property) throw new NotFoundException('Property not found');

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const newComment = this.commentRepo.create({
      message: dto.message,
      property,
      user,
    });

    return this.commentRepo.save(newComment);
  }

  // -----------------------------------------------------
  // GET ALL COMMENTS OF A PROPERTY
  // -----------------------------------------------------
  async findByProperty(propertyId: number) {
    return this.commentRepo.find({
      where: { property: { id: propertyId } },
      relations: ['user'],
      order: { created_at: 'DESC' },
    });
  }

  // -----------------------------------------------------
  // UPDATE OWN COMMENT
  // -----------------------------------------------------
  async update(commentId: number, userId: number, dto: UpdateCommentDto) {
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
      relations: ['user'],
    });

    if (!comment) throw new NotFoundException('Comment not found');

    if (comment.user.id !== userId) {
      throw new ForbiddenException('You cannot edit a comment that is not yours');
    }

    if (dto.message !== undefined) {
      comment.message = dto.message;
    }

    return this.commentRepo.save(comment);
  }

  // -----------------------------------------------------
  // DELETE COMMENT (OWNER OR ADMIN)
  // -----------------------------------------------------
  async remove(commentId: number, userId: number, isAdmin: boolean) {
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
      relations: ['user'],
    });

    if (!comment) throw new NotFoundException('Comment not found');

    const isOwner = comment.user.id === userId;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Not allowed to delete this comment');
    }

    await this.commentRepo.remove(comment);
    return { message: 'Comment deleted successfully' };
  }
}
