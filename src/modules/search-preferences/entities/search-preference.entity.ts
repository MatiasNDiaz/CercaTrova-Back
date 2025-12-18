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

@Entity('search_preferences')
export class SearchPreference {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, user => user.searchPreferences, {
    onDelete: 'CASCADE'
  })
  user: User;

  @Column({ nullable: true })
  zone: string;

@ManyToOne(() => PropertyType, { nullable: true, eager: true })
@JoinColumn({ name: 'typeOfPropertyId' })
typeOfProperty: PropertyType;

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
