import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Property } from '../../properties/entities/property.entity';

// (ERROR_FIXES R-13): un usuario solo puede tener UNA valoración por
// propiedad — la constraint frena a nivel DB los duplicados por carrera
// que el findOne del service no puede evitar (verificado: sin duplicados
// preexistentes en la DB antes de agregarla)
// 'userId' ya queda cubierto por el prefijo del UNIQUE de abajo; 'propertyId'
// no tenía índice y lo usan el promedio del catálogo y el ranking best-rated.
@Index(['propertyId'])
@Unique(['userId', 'propertyId'])
@Entity('ratings')
export class Rating {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  score: number;

  // AGREGAMOS ESTA COLUMNA EXPLÍCITA
  @Column()
  userId: number;

  @ManyToOne(() => User, user => user.ratings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' }) // Vinculamos la columna con la relación
  user: User;

  @Column()
  propertyId: number; // También podés hacer lo mismo con propertyId si querés

  @ManyToOne(() => Property, property => property.ratings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'propertyId' })
  property: Property;
}