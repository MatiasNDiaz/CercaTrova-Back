import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('search_preferences')
export class SearchPreference {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  rooms: number;

  @Column()
  bathrooms: number;

  @Column()
  garage: boolean;

  @Column()
  patio: boolean;

  @Column('decimal')
  price_min: number;

  @Column('decimal')
  price_max: number;

  @Column()
  zone: string;

  @Column()
  property_type: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, user => user.searchPreferences, { nullable: true })
  user: User;
}
