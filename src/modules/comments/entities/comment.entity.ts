import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Property } from '../../properties/entities/property.entity';

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  message: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, user => user.comments)
  user: User;

  @ManyToOne(() => Property, property => property.comments)
  property: Property;
}
