import { Entity, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Property } from '../../properties/entities/property.entity';

@Entity('favorites')
export class Favorite {
  @PrimaryColumn()
  user_id: number;

  @PrimaryColumn()
  property_id: number;

  @ManyToOne(() => User, user => user.favorites)
  user: User;

  @ManyToOne(() => Property, property => property.favorites)
  property: Property;
}
