import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique, Index, Check } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Property } from '../../properties/entities/property.entity';

// (ERROR_FIXES R-13): un usuario solo puede tener UNA valoración por
// propiedad — la constraint frena a nivel DB los duplicados por carrera
// que el findOne del service no puede evitar (verificado: sin duplicados
// preexistentes en la DB antes de agregarla)
// 'userId' ya queda cubierto por el prefijo del UNIQUE de abajo; 'propertyId'
// no tenía índice y lo usan el promedio del catálogo y el ranking best-rated.
//
// Visitantes sin sesión: UNA calificación por visitante (cookie `ct_vid`) y
// propiedad — índice único PARCIAL, solo sobre las filas anónimas. El UNIQUE
// (userId, propertyId) de arriba no choca con ellas: Postgres no considera
// iguales dos NULL.
@Index(['propertyId'])
@Unique(['userId', 'propertyId'])
@Index(['visitorId', 'propertyId'], { unique: true, where: '"userId" IS NULL' })
@Check('"score" BETWEEN 1 AND 5')
@Entity('ratings')
export class Rating {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  score: number;

  /** Autor registrado. `null` = calificación de un visitante sin sesión. */
  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, user => user.ratings, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'userId' }) // Vinculamos la columna con la relación
  user: User | null;

  /** Cookie anónima `ct_vid` y hash de IP — internos, nunca salen (`select: false`). */
  @Column({ type: 'varchar', length: 36, nullable: true, select: false })
  visitorId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  ipHash: string | null;

  @Column()
  propertyId: number; // También podés hacer lo mismo con propertyId si querés

  @ManyToOne(() => Property, property => property.ratings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'propertyId' })
  property: Property;
}