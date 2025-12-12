import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { typeOfProperty } from '../dto/enumTypeOfProperty';

@Entity('search_preferences')
export class SearchPreference {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, user => user.searchPreferences, { onDelete: 'CASCADE' })
  user: User;

  @Column({ nullable: true })
  zone: string;

  @Column({ type: 'enum', enum: typeOfProperty, nullable: true })
  typeOfProperty: typeOfProperty;

  @Column({ nullable: true })
  minPrice: number;

  @Column({ nullable: true })
  maxPrice: number;

  @Column({ nullable: true })
  m2: number;

  @Column({ nullable: true })
  minRooms: number;

  @Column({ nullable: true })
  minBathrooms: number;

  @Column({ default: true })
  notifyNewMatches: boolean;

  @Column({ default: true })
  notifyPriceDrops: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

