import { Entity, ManyToOne, PrimaryColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Property } from '../../properties/entities/property.entity';

// 'user_id' ya queda cubierto por el prefijo de la PK compuesta; 'property_id'
// no, y lo usan el ranking most-favorited y el CASCADE al borrar una propiedad.
@Index(['property_id'])
@Entity('favorites')
export class Favorite {
  @PrimaryColumn()
  user_id: number;

  @PrimaryColumn()
  property_id: number;

 
  @ManyToOne(() => User, user => user.favorites, {
  onDelete: 'CASCADE',
})
user: User;

  @ManyToOne(() => Property, property => property.favorites)
  property: Property;
}
