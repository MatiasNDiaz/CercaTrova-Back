import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';
import { OperationType } from 'src/modules/properties/dto/enumsStatusProperty';

/**
 * Registro de UNA búsqueda con filtros en el catálogo (`GET /properties/filter`).
 *
 * Es la "Fuente 1" de las estadísticas de búsquedas más populares: cada fila es
 * un voto hacia los criterios que el usuario efectivamente usó. La "Fuente 2"
 * son las `SearchPreference` guardadas.
 *
 * Todas las columnas son nullable a propósito: una búsqueda típica usa dos o
 * tres filtros, no todos. El cálculo de la Fase 1 solo cuenta los NO nulos.
 *
 * ⚠️ Ojo, no confundir con `UserSearchFeedback` (tabla `user_search_feedback`):
 * aquélla es un formulario de feedback que el usuario completa a mano y sobre
 * la que ya trabaja el módulo `stats`. Ésta se llena SOLA en cada búsqueda y
 * refleja los filtros reales del catálogo de hoy (incluidas las superficies y
 * la documentación legal, que la otra tabla no tiene).
 */
@Entity('filter_usages')
@Index(['createdAt'])
export class FilterUsage {
  @PrimaryGeneratedColumn()
  id: number;

  /** UUID anónimo del visitante (cookie). */
  @Column()
  visitorId: string;

  /** Null si la búsqueda la hizo alguien sin sesión. */
  @Column({ type: 'int', nullable: true })
  userId: number | null;

  // ── Ubicación ──
  @Column({ nullable: true }) provincia: string;
  @Column({ nullable: true }) localidad: string;
  @Column({ nullable: true }) barrio: string;
  @Column({ nullable: true }) zone: string;

  // ── Tipo y operación ──
  @Column({ type: 'int', nullable: true }) typeOfPropertyId: number;
  @Column({ type: 'enum', enum: OperationType, nullable: true }) operationType: OperationType;

  // ── Numéricos ──
  @Column({ type: 'int', nullable: true }) rooms: number;
  @Column({ type: 'int', nullable: true }) bathrooms: number;
  @Column({ type: 'int', nullable: true }) minPrice: number;
  @Column({ type: 'int', nullable: true }) maxPrice: number;
  @Column({ type: 'int', nullable: true }) minSupTotal: number;
  @Column({ type: 'int', nullable: true }) maxSupTotal: number;
  @Column({ type: 'int', nullable: true }) minSupCubierta: number;
  @Column({ type: 'int', nullable: true }) maxSupCubierta: number;
  @Column({ type: 'int', nullable: true }) maxAntiquity: number;

  // ── Booleanos (solo se guardan si el usuario los activó) ──
  @Column({ type: 'boolean', nullable: true }) garage: boolean;
  @Column({ type: 'boolean', nullable: true }) patio: boolean;
  @Column({ type: 'boolean', nullable: true }) property_deed: boolean;
  @Column({ type: 'boolean', nullable: true }) tractoAbreviado: boolean;
  @Column({ type: 'boolean', nullable: true }) boleto: boolean;

  /** Texto libre del buscador, si lo usó. */
  @Column({ type: 'text', nullable: true }) search: string;

  @CreateDateColumn()
  createdAt: Date;
}
