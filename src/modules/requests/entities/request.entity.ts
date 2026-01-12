import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum OperationType {
  ALQUILER = "alquiler",
  VENTA = "venta",
}

// Nota: Aunque aquí usamos enum para estadísticas rápidas, 
// el Admin verá tendencias de qué tipos se piden más.
export enum PropertyTypeEnum {
  CASA = "casa",
  DEPARTAMENTO = "departamento",
  TERRENO = "terreno",
  LOCAL = "local",
  OFICINA = "oficina"
}


@Entity('user_search_feedback')
export class UserSearchFeedback {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true }) rooms: number;
  @Column({ nullable: true }) bathrooms: number;
  @Column({ nullable: true }) zone: string;
  @Column({ nullable: true }) localidad: string;
  @Column({ nullable: true }) barrio: string;
  
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) priceMin: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) priceMax: number;

  @Column({ type: 'enum', enum: PropertyTypeEnum, nullable: true }) propertyType: PropertyTypeEnum;
  @Column({ type: 'enum', enum: OperationType, nullable: true }) operationType: OperationType;

  @Column({ nullable: true }) antiquityMax: number;
  @Column({ nullable: true }) hasGarage: boolean;
  @Column({ nullable: true }) hasPatio: boolean;
  @Column({ type: "text", nullable: true }) notes: string;

  @Column() deviceId: string;

  @CreateDateColumn() createdAt: Date;
}