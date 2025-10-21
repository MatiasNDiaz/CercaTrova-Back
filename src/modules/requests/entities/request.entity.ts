import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToOne, CreateDateColumn, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Property } from '../../properties/entities/property.entity';

@Entity('request_properties')
export class Request {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  property_type: string;

  @Column()
  address: string;

  @Column('text')
  description: string;

  @Column('decimal')
  price_suggested: number;

  @Column('text', { nullable: true })
  images: string;

  @Column()
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, user => user.requests)
  user: User;

  @OneToOne(() => Property, { nullable: true })
  @JoinColumn()
  property: Property;
}
