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

  /**
   * Posición de la imagen dentro de la galería de su propiedad (0 = primera).
   *
   * Antes no había ningún campo de orden: las imágenes salían como las
   * devolviera Postgres en el join, sin `ORDER BY`, y lo único que el admin
   * podía elegir era cuál era la portada. Ahora el orden completo se persiste.
   *
   * ⚠️ INVARIANTE: la imagen con `order = 0` es SIEMPRE la portada
   * (`isCover: true`). Los dos caminos que pueden romperla —`reorder()` y
   * `setAsCover()`— la restablecen dentro de la misma transacción. Se decidió
   * así para no tener dos controles que se contradigan: el admin arrastra, y la
   * primera de la fila es la que se ve en el catálogo.
   */
  @Column({ type: 'int', default: 0 })
  order: number;

  @Column()
  publicId: string;

  @ManyToOne(() => Property, property => property.images, {
    onDelete: 'CASCADE',
  })
  @Exclude()     // 👈👈👈 SOLO ESTO Y YA NO SALE MÁS EN LA RESPUESTA
  property: Property;
}
