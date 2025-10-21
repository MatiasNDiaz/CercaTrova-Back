// src/modules/users/entities/user.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Property } from '../../properties/entities/property.entity';
import { Request } from '../../requests/entities/request.entity';
import { Favorite } from 'src/modules/favorites/entities/favorite.entity';
import { Rating } from 'src/modules/ratings/entities/rating.entity';
import { SearchPreference } from 'src/modules/search-preferences/entities/search-preference.entity';
import { Comment } from 'src/modules/comments/entities/comment.entity';
import { Notification } from 'src/modules/notifications/entities/notification.entity';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column()
    surname: string; 

    @Column()
    phone: string;

    @Column({ nullable: true })
    photo?: string;

    @Column({ unique: true })
    email: string;

    @Column()
    password: string;

    @Column({ default: false })
    isAdmin: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    // Relaciones
    @OneToMany(() => Property, property => property.agent)
    properties: Property[];

    @OneToMany(() => Rating, rating => rating.user)
    ratings: Rating[];

    @OneToMany(() => Comment, comment => comment.user)
    comments: Comment[];

    @OneToMany(() => SearchPreference, sp => sp.user)
    searchPreferences: SearchPreference[];

    @OneToMany(() => Notification, notification => notification.user)
    notifications: Notification[];

    @OneToMany(() => Request, request => request.user)
    requests: Request[];

    @OneToMany(() => Favorite, favorite => favorite.user)
    favorites: Favorite[];
}
