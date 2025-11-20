import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Property } from '../../properties/entities/property.entity';

@Entity("property_images")
export class PropertyImages {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  url: string;

  @Column({ unique: true, nullable: true })
  hash: string;

  @Column()
  publicId: string;

  @ManyToOne(() => Property, property => property.images, {
    onDelete: 'CASCADE',
  })
  property: Property;
}
