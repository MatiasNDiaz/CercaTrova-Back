import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn
} from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { typeOfProperty } from '../dto/enumTypeOfProperty';
import { PropertyType } from 'src/modules/typeOfProperty/entities/typeOfProperty.entity';
import { OperationType } from 'src/modules/properties/dto/enumsStatusProperty';

@Entity('search_preferences')
export class SearchPreference {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, user => user.searchPreferences, {
    onDelete: 'CASCADE'
  })
  user: User;

  @Column({ nullable: true })
  zone?: string;

  @Column({ nullable: true })
  localidad: string; // Nuevo

  @Column({ nullable: true })
  barrio: string;    // Nuevo

  @Column({
    type: 'enum',
    enum: OperationType,
    nullable: true, // Nullable por si al usuario le da igual si es venta o alquiler
  })
  operationType: OperationType;

  @ManyToOne(() => PropertyType, { nullable: true, eager: true })
  @JoinColumn({ name: 'typeOfPropertyId' })
  typeOfProperty: PropertyType;

  @Column({ nullable: true })
  property_deed: boolean;

  @Column({ nullable: true })
  preferredPrice: number;

  @Column({ nullable: true })
  minRooms: number;

  @Column({ nullable: true })
  minBathrooms: number;

  @Column({ nullable: true })
  m2: number;

  @Column({ nullable: true })
  maxAntiquity: number;

  @Column({ default: true })
  notifyNewMatches: boolean;

  @Column({ default: true })
  notifyPriceDrops: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
