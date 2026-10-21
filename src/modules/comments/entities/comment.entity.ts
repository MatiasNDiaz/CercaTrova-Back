import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Property } from '../../properties/entities/property.entity';

// Índices de FK: Postgres NO los crea solo. 'propertyId' lo usa el listado de
// comentarios de cada propiedad y 'userId' el dashboard "mis comentarios";
// además ambos aceleran el CASCADE al borrar una propiedad o un usuario.
@Index(['propertyId'])
@Index(['userId'])
@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  message: string;

  /**
   * Moderación blanda del admin: el comentario no se borra, deja de mostrarse
   * a los usuarios comunes. El admin lo sigue viendo, marcado como oculto.
   * Mismo criterio que `PostComment.isHidden` en Publicaciones.
   */
  @Column({ default: false })
  isHidden: boolean;

  @CreateDateColumn()
  created_at: Date;

  // 👇 columnas necesarias para filtrar fácilmente
  /**
   * Autor registrado. `null` = comentario de un VISITANTE sin sesión (desde la
   * actualización "interacciones sin iniciar sesión"). Ver `guestName`.
   */
  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column()
  propertyId: number;

  /** Nombre que dejó el visitante (opcional). Sin nombre se muestra "Visitante". */
  @Column({ type: 'varchar', length: 50, nullable: true })
  guestName: string | null;

  /**
   * Cookie anónima `ct_vid` del visitante y hash de su IP — apoyo contra
   * abusos. `select: false`: NUNCA salen en una respuesta salvo que se pidan
   * explícitamente.
   */
  @Column({ type: 'varchar', length: 36, nullable: true, select: false })
  visitorId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  ipHash: string | null;

  // 👇 relaciones
  @ManyToOne(() => User, user => user.comments, { onDelete: 'CASCADE', nullable: true })
  user: User | null;

  @ManyToOne(() => Property, property => property.comments, { onDelete: 'CASCADE' })
  property: Property;
}
