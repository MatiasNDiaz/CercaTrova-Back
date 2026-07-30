import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';

/**
 * Una visita a una página del sitio.
 *
 * `visitorId` es un UUID anónimo que vive en una cookie httpOnly
 * (`VisitorIdMiddleware`). Sirve para no contar como visitantes distintos a la
 * misma persona navegando entre páginas, sin identificarla personalmente.
 *
 * `durationMs` se completa DESPUÉS, cuando el frontend avisa cuánto duró la
 * sesión (`POST /tracking/duration`): al crear la fila todavía no se sabe.
 *
 * `isAdmin` se guarda para poder excluir al equipo de las métricas de tráfico
 * y de tiempo en página sin tener que cruzar contra la tabla de usuarios.
 */
@Entity('page_visits')
@Index(['createdAt'])
@Index(['visitorId', 'createdAt'])
export class PageVisit {
  @PrimaryGeneratedColumn()
  id: number;

  /** UUID anónimo del visitante (cookie). */
  @Column()
  visitorId: string;

  /** Ruta visitada, ej. "/properties/4". */
  @Column()
  path: string;

  /** Null si el visitante no estaba logueado. */
  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  /** true si la visita la hizo un admin — se excluye de las métricas. */
  @Column({ default: false })
  isAdmin: boolean;

  /** Milisegundos que estuvo en la página. Null hasta que el front lo informa. */
  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
