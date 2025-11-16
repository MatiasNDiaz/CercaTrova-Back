import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Property } from '../../properties/entities/property.entity';

@Entity('ratings')
export class Rating {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  score: number;

  @ManyToOne(() => User, user => user.ratings, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Property, property => property.ratings, { onDelete: 'CASCADE' })
  property: Property;
} 