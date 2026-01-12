import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Property } from '../../properties/entities/property.entity';

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