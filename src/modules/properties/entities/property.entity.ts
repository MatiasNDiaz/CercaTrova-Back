import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn, UpdateDateColumn, CreateDateColumn } from "typeorm"
import { User } from "src/modules/users/entities/user.entity";
import { UserSearchFeedback } from '../../requests/entities/request.entity';
import { Favorite } from 'src/modules/favorites/entities/favorite.entity';
import { Rating } from 'src/modules/ratings/entities/rating.entity';
import { Comment } from 'src/modules/comments/entities/comment.entity';
import { PropertyType } from "src/modules/typeOfProperty/entities/typeOfProperty.entity";
import { PropertyImages } from "src/modules/ImagesProperty/entities/ImagesPropertyEntity";
import { IsEnum } from "class-validator";
import { StatusProperty } from "../dto/enumsStatusProperty";

@Entity('property')
export class Property {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    title: string;

    @Column()
    description: string;

    @Column()
    provincia: string; // Ej: "Córdoba"

    @Column()
    localidad: string; // Ej: "Villa Carlos Paz"

    @Column()
    barrio: string;    // Ej: "La Cuesta"
    
    @Column()
    zone: string;

    @Column()
    rooms: number;

    @Column()
    bathrooms: number;

    @Column({ default: false })
    property_deed: boolean;

    @Column()
    garage: boolean;

    @Column()
    patio: boolean;

    @Column({ type: 'int', nullable: true })
    m2: number;

    @Column()
    antiquity: number;

    @Column()
    price: number;

    @Column()
    @IsEnum(StatusProperty)
    status: StatusProperty;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    // Relaciones
    @OneToMany(() => PropertyImages, images => images.property, {
    cascade: true,
    onDelete: 'CASCADE'
    })
    images: PropertyImages[];

    @ManyToOne(() => User, user => user.properties)
    agent: User;

    @OneToMany(() => Rating, rating => rating.property)
    ratings: Rating[];

    @OneToMany(() => Comment, comment => comment.property)
    comments: Comment[];

    @OneToMany(() => Favorite, favorite => favorite.property)
    favorites: Favorite[];
    
    // @OneToMany(() => Request, request => request.property)
    // requests: Request[];

    @ManyToOne(() => User, { nullable: true }) // nullable porque puede no tener recomendador
    
    @JoinColumn({ name: 'referredById' })
    referredBy?: User;

    @ManyToOne(() => PropertyType, { eager: true })
    typeOfProperty: PropertyType;
}