// src/modules/PropertyRequest/entities/PropertyRequest.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum RequestStatus {
  ENVIADO = 'enviado',
  REVISION = 'en_revision',
  ACEPTADO = 'aceptado',
  RECHAZADO = 'rechazado',
}

@Entity('property_requests')
export class PropertyRequest {
  @PrimaryGeneratedColumn()
  id: number;

  // --- Ubicación Exacta (Para que el agente llegue a tasar) ---
  @Column()
  localidad: string;

  @Column()
  barrio: string;

  @Column()
  direccion: string; // Calle y número

  @Column({ nullable: true })
  pisoDepto: string; // Opcional (Ej: "4B" o "PB")

  // --- Características Técnicas ---
  @Column()
  tipoPropiedad: string;

  @Column()
  tipoOperacion: string;

  @Column()
  estadoConservacion: string;

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
  orientacion: string;

  // --- Información Legal y Comercial ---
  @Column({ default: false })
  escritura: boolean;

  @Column({ default: false })
  impuestosAlDia: boolean;

  @Column({ default: false })
  aptoCredito: boolean;

  @Column('decimal', { precision: 12, scale: 2 })
  precioEstimado: number;

  @Column({ type: 'text', nullable: true })
  mensajeAgente: string;

  // --- Gestión de la Solicitud ---
  @Column({ type: 'enum', enum: RequestStatus, default: RequestStatus.REVISION })
  status: RequestStatus;

  // --- Relación con el Dueño ---
  @Column()
  userId: number;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}