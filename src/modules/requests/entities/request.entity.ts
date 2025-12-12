import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('user_search_feedback')
export class UserSearchFeedback {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  rooms: number;

  @Column({ nullable: true })
  bathrooms: number;

  @Column({ nullable: true })
  zone: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  priceMin: number;

  @Column({ nullable: true })
  priceMax: number;

  @Column({ nullable: true })
  propertyType: string;

  @Column({ nullable: true })
  operationType: string;

  @Column({ nullable: true })
  antiquityMin: number;

  @Column({ nullable: true })
  antiquityMax: number;

  @Column({ nullable: true })
  hasGarage: boolean;

  @Column({ nullable: true })
  hasPatio: boolean;

  @Column({ type: "text", nullable: true })
  notes: string;

  // Evita spam del usuario
  @Column()
  deviceId: string;

  @CreateDateColumn()
  createdAt: Date;

  
}

