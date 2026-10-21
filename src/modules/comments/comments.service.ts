import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, In, Repository } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Property } from '../properties/entities/property.entity';
import { User } from '../users/entities/user.entity';
import { NotificationService } from '../notifications/notifications.service'; // 👈
import { StatusProperty } from '../properties/dto/enumsStatusProperty';
import { InteractionActor, displayName } from 'src/common/interaction/interaction-actor';
import { isHoneypotFilled } from 'src/common/interaction/interaction.dto';

/** Estados en los que una propiedad NO acepta comentarios (no es pública). */
const NOT_PUBLIC = [StatusProperty.ELIMINADO, StatusProperty.PAUSADO];

/**
 * Forma pública de un comentario: suma el nombre a mostrar y si es anónimo.
 * `visitorId` / `ipHash` nunca están (columnas `select: false`).
 */
const toPublic = (c: Comment) => ({
  ...c,
  authorName: displayName(c),
  isAnonymous: c.userId === null,
});

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

  /**
   * Crea un comentario — de un usuario logueado (queda asociado a su cuenta,
   * como siempre) o de un VISITANTE sin sesión (`userId: null`, con el nombre
   * opcional que dejó).
   */
  async create(propertyId: number, actor: InteractionActor, dto: CreateCommentDto) {
    const property = await this.propertyRepo.findOne({
      where: { id: propertyId, status: Not(In(NOT_PUBLIC)) },
    });
    if (!property) throw new NotFoundException('La propiedad no existe');

    const user = actor.userId ? await this.userRepo.findOne({ where: { id: actor.userId } }) : null;
    if (actor.userId && !user) throw new NotFoundException('El usuario no existe');

    const guestName = user ? null : dto.guestName?.trim() || null;

    // Honeypot completo = bot: se responde como si se hubiera guardado, sin
    // guardar nada ni avisar al admin.
    if (isHoneypotFilled(dto)) {
      return toPublic(this.commentRepo.create({
        id: 0, message: dto.message, isHidden: false, created_at: new Date(),
        userId: null, propertyId, guestName,
      }));
    }

    const saved = await this.commentRepo.save(
      this.commentRepo.create({
        message: dto.message,
        property,
        user,
        guestName,
        visitorId: actor.visitorId,
        ipHash: actor.ipHash,
      }),
    );

    // 👇 Notificar al admin — no bloqueante
    this.notificationService
      .notifyAdminNewComment({
        userName: user?.name ?? (guestName ? `${guestName} (visitante)` : 'Un visitante'),
        propertyTitle: property.title,
        propertyId: property.id,
        commentPreview: dto.message,
        relatedUserId: user?.id ?? null, // 👈
      })
      .catch((err) => console.error('[NOTIF ADMIN] Error en comentario:', err));

    return this.findOnePublic(saved.id);
  }

  /** Un comentario en su forma pública (con el usuario, si tiene). */
  private async findOnePublic(id: number) {
    const c = await this.commentRepo.findOne({
      where: { id },
      relations: ['user'],
      select: {
        id: true, message: true, isHidden: true, created_at: true, userId: true,
        propertyId: true, guestName: true,
        user: { id: true, name: true, surname: true, photo: true },
      },
    });
    return c ? toPublic(c) : null;
  }

  /**
   * `includeHidden` solo lo manda el admin: para el público, un comentario
   * oculto no existe. Mismo criterio que `PostsService.findComments`.
   */
  async findByProperty(propertyId: number, includeHidden = false) {
    const list = await this.commentRepo.find({
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
        guestName: true,
        user: {
          id: true,
          name: true,
          surname: true,
          photo: true,
        },
      },
      order: { created_at: 'DESC' },
    });
    return list.map(toPublic);
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

  /** Editar: solo el AUTOR registrado. Un comentario anónimo no lo edita nadie. */
  async update(commentId: number, userId: number, dto: UpdateCommentDto) {
    const comment = await this.commentRepo.findOne({ where: { id: commentId } });

    if (!comment) throw new NotFoundException('El comentario no existe');
    if (comment.userId === null || comment.userId !== userId)
      throw new ForbiddenException('No podés editar un comentario que no es tuyo');

    if (dto.message !== undefined) comment.message = dto.message;

    await this.commentRepo.save(comment);
    return this.findOnePublic(comment.id);
  }

  /**
   * Eliminar: el autor registrado o un admin. Un comentario ANÓNIMO solo lo
   * puede eliminar el admin (no hay sesión que pruebe la autoría).
   */
  async remove(commentId: number, userId: number, isAdmin: boolean) {
    const comment = await this.commentRepo.findOne({ where: { id: commentId } });

    if (!comment) throw new NotFoundException('El comentario no existe');
    const isAuthor = comment.userId !== null && comment.userId === userId;
    if (!isAuthor && !isAdmin)
      throw new ForbiddenException('No tenés permiso para eliminar este comentario');

    await this.commentRepo.remove(comment);
    return { message: 'Comentario eliminado correctamente' };
  }
}
