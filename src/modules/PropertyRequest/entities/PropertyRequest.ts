import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum RequestStatus {
  REVISION = 'en_revision',
  ACEPTADA = 'aceptada',
  RECHAZADA = 'rechazada',
}

@Entity('property_requests')
export class PropertyRequest {
  @PrimaryGeneratedColumn()
  id: number;

  // --- Ubicación ---
  @Column()
  localidad: string;

  @Column()
  barrio: string;

  // --- Características Técnicas (Para el filtrado futuro) ---
  @Column()
  tipoPropiedad: string; // Casa, Departamento, Duplex, Local Comercial, etc.

  @Column()
  tipoOperacion: string; // Venta o Alquiler

  @Column()
  estadoConservacion: string; // Excelente, Bueno, A refaccionar

  @Column('float')
  m2Totales: number;

  @Column('float')
  m2Cubiertos: number;

  @Column()
  habitaciones: number;

  @Column()
  baños: number;

  @Column({ default: false })
  patio: boolean;

  @Column({ default: false })
  garage: boolean;

  @Column()
  antiguedad: number;

  @Column({ nullable: true })
  orientacion: string; // Norte, Sur, Este, Oeste

  // --- Información Legal y Comercial ---
  @Column({ default: false })
  escritura: boolean; // ¿Tiene escritura o boleto?

  @Column({ default: false })
  impuestosAlDia: boolean;

  @Column({ default: false })
  aptoCredito: boolean;

  @Column('decimal', { precision: 12, scale: 2 })
  precioEstimado: number;

  // --- Multimedia y Notas ---
  @Column('simple-array', { nullable: true })
  images: string[];

  @Column({ type: 'text', nullable: true })
  mensajeAgente: string; // Notas aclaratorias del usuario

  // --- Gestión de la Solicitud ---
  @Column({ type: 'enum', enum: RequestStatus, default: RequestStatus.REVISION })
  status: RequestStatus;

  // --- Relación con el Dueño ---
  @Column()
  userId: number;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'userId' })
  user: User; // De acá sacaremos el mail y WhatsApp automáticamente

  @CreateDateColumn()
  createdAt: Date;
}