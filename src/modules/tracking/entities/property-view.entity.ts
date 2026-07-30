import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { Property } from 'src/modules/properties/entities/property.entity';

/**
 * Una vista del detalle de una propiedad (`GET /properties/:id`).
 *
 * Alimenta el ranking de "propiedades más visitadas". Las vistas del ADMIN no
 * se registran: si no, revisar el catálogo desde el panel inflaría la métrica.
 *
 * Se guarda una fila por vista (no un contador) para poder filtrar después por
 * rango de fechas (día/semana/mes), que es justo lo que pide el dashboard.
 */
@Entity('property_views')
@Index(['createdAt'])
@Index(['propertyId', 'createdAt'])
export class PropertyView {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  propertyId: number;

  @ManyToOne(() => Property, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'propertyId' })
  property: Property;

  /** UUID anónimo del visitante (cookie). */
  @Column()
  visitorId: string;

  /** Null si el visitante no estaba logueado. */
  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
