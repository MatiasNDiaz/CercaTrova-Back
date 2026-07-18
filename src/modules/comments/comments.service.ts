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
import { NotificationService } from '../notifications/notifications.service'; // 👈

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>,

    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly notificationService: NotificationService, // 👈
  ) {}

  async create(propertyId: number, userId: number, dto: CreateCommentDto) {
    const property = await this.propertyRepo.findOne({ where: { id: propertyId } });
    if (!property) throw new NotFoundException('Property not found');

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const newComment = this.commentRepo.create({
      message: dto.message,
      property,
      user,
    });

    const saved = await this.commentRepo.save(newComment);

    // 👇 Notificar al admin — no bloqueante
    this.notificationService
      .notifyAdminNewComment({
        userName: user.name,
        propertyTitle: property.title,
        propertyId: property.id,
        commentPreview: dto.message,
        relatedUserId: user.id, // 👈
      })
      .catch((err) => console.error('[NOTIF ADMIN] Error en comentario:', err));

    return saved;
  }

  async findByProperty(propertyId: number) {
    return this.commentRepo.find({
      where: { property: { id: propertyId } },
      relations: ['user'],
      select: {
        id: true,
        message: true,
        created_at: true,
        userId: true,
        propertyId: true,
        user: {
          id: true,
          name: true,
          surname: true,
          photo: true,
        },
      },
      order: { created_at: 'DESC' },
    });
  }

  async update(commentId: number, userId: number, dto: UpdateCommentDto) {
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
      relations: ['user'],
    });

    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.user.id !== userId)
      throw new ForbiddenException('You cannot edit a comment that is not yours');

    if (dto.message !== undefined) comment.message = dto.message;

    return this.commentRepo.save(comment);
  }

  async remove(commentId: number, userId: number, isAdmin: boolean) {
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
      relations: ['user'],
    });

    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.user.id !== userId && !isAdmin)
      throw new ForbiddenException('Not allowed to delete this comment');

    await this.commentRepo.remove(comment);
    return { message: 'Comment deleted successfully' };
  }
}