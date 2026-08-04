import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index } from 'typeorm';
import { Property } from '../../properties/entities/property.entity';
import { Exclude } from 'class-transformer';

// Toda lectura de una propiedad trae sus imágenes por esta FK.
@Index(['property'])
@Entity("property_images")
export class PropertyImages {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  url: string;

  @Column({ unique: true, nullable: true })
  hash: string;

  @Column({ default: false })
  isCover: boolean;

  @Column()
  publicId: string;

  @ManyToOne(() => Property, property => property.images, {
    onDelete: 'CASCADE',
  })
  @Exclude()     // 👈👈👈 SOLO ESTO Y YA NO SALE MÁS EN LA RESPUESTA
  property: Property;
}
