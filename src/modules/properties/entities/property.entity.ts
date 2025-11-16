import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn, UpdateDateColumn, CreateDateColumn } from "typeorm"
import { User } from "src/modules/users/entities/user.entity";
import { Request } from '../../requests/entities/request.entity';
import { Favorite } from 'src/modules/favorites/entities/favorite.entity';
import { Rating } from 'src/modules/ratings/entities/rating.entity';
import { Comment } from 'src/modules/comments/entities/comment.entity';

@Entity('property')
export class Property {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    title: string;

    @Column()
    description: string;

    @Column()
    type: string;

    @Column()
    zone: string;

    @Column()
    rooms: number;

    @Column()
    bathrooms: number;

    @Column()
    garage: boolean;

    @Column()
    patio: boolean;

    @Column()
    antiquity: number;

    @Column()
    price: number;

    @Column()
    status: string;

    @Column()
    image_url: string;

    @Column()
    video_url: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    // Relaciones
    @ManyToOne(() => User, user => user.properties)
    agent: User;

    @OneToMany(() => Rating, rating => rating.property)
    ratings: Rating[];

    @OneToMany(() => Comment, comment => comment.property)
    comments: Comment[];

    @OneToMany(() => Favorite, favorite => favorite.property)
    favorites: Favorite[];
    @OneToMany(() => Request, request => request.property)
    requests: Request[];

    @ManyToOne(() => User, { nullable: true }) // nullable porque puede no tener recomendador
    
    @JoinColumn({ name: 'referredById' })
    referredBy?: User;
}