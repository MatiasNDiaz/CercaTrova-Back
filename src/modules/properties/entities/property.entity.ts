import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn, UpdateDateColumn, CreateDateColumn, Index } from "typeorm"
import { User } from "src/modules/users/entities/user.entity";
import { UserSearchFeedback } from '../../requests/entities/request.entity';
import { Favorite } from 'src/modules/favorites/entities/favorite.entity';
import { Rating } from 'src/modules/ratings/entities/rating.entity';
import { Comment } from 'src/modules/comments/entities/comment.entity';
import { PropertyType } from "src/modules/typeOfProperty/entities/typeOfProperty.entity";
import { PropertyImages } from "src/modules/ImagesProperty/entities/ImagesPropertyEntity";
import { IsEnum } from "class-validator";
import { Currency, OperationType, StatusProperty } from "../dto/enumsStatusProperty";

// El catálogo (GET /properties/filter) SIEMPRE filtra por status y, por
// defecto, ordena por created_at DESC. Sin este índice cada página del
// catálogo es un seq scan + sort de la tabla entera.
@Index(['status', 'created_at'])
@Entity('property')
export class Property {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    title!: string;

    @Column()
    description!: string;

    @Column()
    provincia!: string; // Ej: "Córdoba"

    @Column()
    localidad!: string; // Ej: "Villa Carlos Paz"

    @Column()
    barrio!: string;    // Ej: "La Cuesta"

    // Dirección exacta (calle y número) — es la fuente del mapa en el detalle.
    // Nullable para no romper las propiedades ya cargadas antes de este campo.
    @Column({ nullable: true })
    direccion!: string; // Ej: "Av. San Martín 1250"

    @Column()
    zone!: string;

    @Column()
    rooms!: number;

    @Column()
    bathrooms!: number;

    // Documentación legal: los tres son independientes entre sí — una propiedad
    // puede tener cualquier combinación de escritura, tracto abreviado y boleto.
    @Column({ default: false })
    property_deed!: boolean;

    @Column({ default: false })
    tractoAbreviado!: boolean;

    @Column({ default: false })
    boleto!: boolean;

    @Column()
    garage!: boolean;

    @Column()
    patio!: boolean;

    // A diferencia de `garage`/`patio`, lleva `default: false` explícito: sin él
    // la columna sería NOT NULL sin default y el ALTER TABLE fallaría sobre las
    // filas existentes.
    @Column({ default: false })
    aptoMascotas!: boolean;

    @Column({ type: 'int', nullable: true })
    supTotal!: number;

    @Column({ type: 'int', nullable: true })
    supCubierta!: number;

    @Column()
    antiquity!: number;

    @Column()
    price!: number;

    /**
     * Expensas mensuales. Opcional: no toda propiedad tiene (una casa no paga).
     *
     * ⚠️ SIEMPRE EN PESOS, sin importar `currency`. No es una simplificación:
     * en el mercado local el inmueble se publica en dólares y las expensas se
     * cobran en pesos — una casa de USD 85.000 no tiene expensas de USD 45.000.
     * Por eso no tiene columna de moneda propia.
     *
     * `int` y no `decimal`: son montos mensuales redondeados, nadie publica
     * expensas con centavos, y un `decimal` de TypeORM vuelve como STRING en las
     * respuestas (obligaría a parsear en el frontend y a documentar la rareza).
     */
    @Column({ type: 'int', nullable: true })
    expensas!: number | null;

    // Moneda de `price`. Default USD porque todo el catálogo previo a esta
    // columna estaba cargado en dólares (el frontend imprimía "USD" fijo), así
    // que las filas viejas quedan bien sin backfill.
    @Column({
    type: 'enum',
    enum: Currency,
    default: Currency.USD,
    })
    currency!: Currency;

    @Column()
    @IsEnum(StatusProperty)
    status!: StatusProperty;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;

    // Relaciones
    @OneToMany(() => PropertyImages, images => images.property, {
    cascade: true,
    onDelete: 'CASCADE'
    })
    images!: PropertyImages[];

    @ManyToOne(() => User, user => user.properties)
    agent!: User;

    @Column({
    type: 'enum',
    enum: OperationType,
    default: OperationType.VENTA,
    })
    operationType!: OperationType;

    @OneToMany(() => Rating, rating => rating.property)
    ratings!: Rating[];

    @OneToMany(() => Comment, comment => comment.property)
    comments!: Comment[];

    @OneToMany(() => Favorite, favorite => favorite.property)
    favorites!: Favorite[];
    
    // @OneToMany(() => Request, request => request.property)
    // requests: Request[];

    @ManyToOne(() => User, { nullable: true }) // nullable porque puede no tener recomendador
    
    @JoinColumn({ name: 'referredById' })
    referredBy?: User;

    @ManyToOne(() => PropertyType, { eager: true })
    typeOfProperty!: PropertyType;
}