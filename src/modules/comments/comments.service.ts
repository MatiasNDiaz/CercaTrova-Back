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
    if (!property) throw new NotFoundException('La propiedad no existe');

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('El usuario no existe');

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

  /**
   * `includeHidden` solo lo manda el admin: para el público, un comentario
   * oculto no existe. Mismo criterio que `PostsService.findComments`.
   */
  async findByProperty(propertyId: number, includeHidden = false) {
    return this.commentRepo.find({
      where: {
        property: { id: propertyId },
        ...(includeHidden ? {} : { isHidden: false }),
      },
      relations: ['user'],
      select: {
        id: true,
        message: true,
        isHidden: true,
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

  /**
   * Comentarios que dejó un usuario, con la propiedad cargada — alimenta
   * "Propiedades que comenté" del dashboard del usuario.
   * Incluye los ocultos: es su propio contenido, y se marcan en la UI.
   */
  async findByUser(userId: number) {
    return this.commentRepo.find({
      where: { user: { id: userId } },
      relations: ['property', 'property.images', 'property.typeOfProperty'],
      order: { created_at: 'DESC' },
    });
  }

  /** Togglea la visibilidad de un comentario (solo admin, ver controller). */
  async toggleHidden(commentId: number) {
    const comment = await this.commentRepo.findOne({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('El comentario no existe');

    comment.isHidden = !comment.isHidden;
    await this.commentRepo.save(comment);

    return {
      id: comment.id,
      isHidden: comment.isHidden,
      message: comment.isHidden ? 'Comentario ocultado' : 'Comentario visible de nuevo',
    };
  }

  async update(commentId: number, userId: number, dto: UpdateCommentDto) {
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
      relations: ['user'],
    });

    if (!comment) throw new NotFoundException('El comentario no existe');
    if (comment.user.id !== userId)
      throw new ForbiddenException('No podés editar un comentario que no es tuyo');

    if (dto.message !== undefined) comment.message = dto.message;

    return this.commentRepo.save(comment);
  }

  async remove(commentId: number, userId: number, isAdmin: boolean) {
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
      relations: ['user'],
    });

    if (!comment) throw new NotFoundException('El comentario no existe');
    if (comment.user.id !== userId && !isAdmin)
      throw new ForbiddenException('No tenés permiso para eliminar este comentario');

    await this.commentRepo.remove(comment);
    return { message: 'Comentario eliminado correctamente' };
  }
}