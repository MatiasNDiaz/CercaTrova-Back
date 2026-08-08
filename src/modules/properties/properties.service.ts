// src/modules/properties/properties.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  BadGatewayException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Property } from './entities/property.entity';
import { User } from '../users/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { PropertyType } from '../typeOfProperty/entities/typeOfProperty.entity';
import { PropertyFilterDto } from './dto/property-filter.dto';
import { CloudinaryService } from 'src/common/Cloudinary/cloudinary.service';
import { Express } from 'express';
type MulterFile = Express.Multer.File;
import { PropertyImages } from '../ImagesProperty/entities/ImagesPropertyEntity';
import { PropertyImagesService } from '../ImagesProperty/propertyImages.service'; // <- asegurate ruta correcta
import { NotificationService } from '../notifications/notifications.service';
import { StatusProperty } from './dto/enumsStatusProperty';

/**
 * Campos del agente que SÍ pueden viajar en una respuesta pública.
 *
 * 🔒 Los endpoints de propiedades son `@Public()` y cargaban la relación
 * `agent` completa, con lo cual cualquier visitante anónimo recibía el `email`,
 * el `tokenVersion`, `notifyBroadcast`, `profileIncomplete` y `authProvider` del
 * administrador. `tokenVersion` incluso revela cuántas veces cerró sesión o
 * cambió la contraseña.
 *
 * Se dejan solo los datos de contacto que tiene sentido publicar de un agente
 * inmobiliario. El email queda AFUERA a propósito: el contacto del sitio va por
 * teléfono y por el formulario, no hace falta exponerlo al scraping.
 *
 * Mismo criterio que `USER_PUBLIC_FIELDS` en `posts.service.ts`.
 */
const AGENT_PUBLIC_FIELDS = ['id', 'name', 'surname', 'phone', 'photo'] as const;

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
    
    @InjectRepository(PropertyType)
    private readonly propertyTypeRepo: Repository<PropertyType>,
    
    @InjectRepository(PropertyImages)
    private readonly propertyImageRepository: Repository<PropertyImages>,
    
    private readonly cloudinaryService: CloudinaryService,
    
    private readonly notificationService: NotificationService,
    
    private readonly propertyImagesService: PropertyImagesService, // inyectado
  ) {}
  
  /**
   * Adjunta `ratingAverage` a un lote de propiedades con UNA sola query.
   *
   * Reemplaza el patrón N+1 que había en `findAll()` (una subconsulta AVG por
   * cada propiedad, dentro de un `Promise.all`): con 200 propiedades eran 201
   * queries. Acá se resuelve con un único GROUP BY sobre los ids de la página.
   *
   * Devuelve objetos planos (no entidades) porque es lo que ya consumía el
   * frontend: la property tal cual más el campo calculado.
   */
  /**
   * Ordena la galería de cada propiedad por `order ASC` (con `id` de desempate).
   *
   * En `findOne()` esto se resuelve con un `ORDER BY` en la query, que es lo
   * correcto. Acá NO se puede: `findAll()` y `filter()` usan `skip`/`take`, y
   * con un join one-to-many TypeORM pagina con una subconsulta `DISTINCT` sobre
   * los ids — ordenar ahí por una columna de la relación joineada hace fallar la
   * query ("column must appear in the SELECT DISTINCT list").
   *
   * El costo es despreciable: son como mucho 10 imágenes por propiedad y 100
   * propiedades por página, sobre datos que ya están en memoria. Y mantiene el
   * contrato parejo — `images` viene ordenado en las tres lecturas públicas, no
   * solo en el detalle.
   */
  private sortImages<T extends { images?: { order?: number; id: number }[] }>(properties: T[]): T[] {
    for (const p of properties) {
      p.images?.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id);
    }
    return properties;
  }

  private async withRatingAverage<T extends { id: number }>(properties: T[]): Promise<(T & { ratingAverage: number })[]> {
    if (properties.length === 0) return [];

    const ids = properties.map((p) => p.id);
    const rows = await this.propertyRepo
      .createQueryBuilder('p')
      .leftJoin('p.ratings', 'r')
      .select('p.id', 'id')
      .addSelect('COALESCE(AVG(r.score), 0)', 'avg')
      .where('p.id IN (:...ids)', { ids })
      .groupBy('p.id')
      .getRawMany<{ id: number; avg: string }>();

    const byId = new Map(rows.map((r) => [Number(r.id), Number(r.avg) || 0]));
    return properties.map((p) => ({ ...p, ratingAverage: byId.get(p.id) ?? 0 }));
  }

  /**
   * Listado paginado de propiedades.
   *
   * ⚠️ CAMBIO DE CONTRATO: antes devolvía un ARRAY plano con TODAS las
   * propiedades; ahora devuelve `{ data, meta }` paginado, igual que
   * `GET /properties/filter`. El endpoint no tenía ningún tope: con el catálogo
   * creciendo, una request pública traía la tabla entera con 4 relaciones.
   *
   * Además se eliminó el N+1: había una subconsulta `AVG(rating.score)` POR
   * PROPIEDAD dentro de un `Promise.all` (14 propiedades = 15 queries, 510 ms).
   * Ahora `withRatingAverage()` lo resuelve con una sola query para la página.
   *
   * `agent` se carga con `leftJoin` + campos públicos, no con la relación
   * completa: antes viajaban el email, el teléfono y el `tokenVersion` del
   * agente en un endpoint público.
   */
  async findAll(page = 1, limit = 10): Promise<{ data: any[]; meta: any }> {
    try {
      const [properties, total] = await this.propertyRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.typeOfProperty', 'type')
        .leftJoinAndSelect('p.images', 'images')
        .leftJoin('p.agent', 'agent')
        .addSelect(AGENT_PUBLIC_FIELDS.map((f) => `agent.${f}`))
        .orderBy('p.created_at', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      const data = await this.withRatingAverage(this.sortImages(properties));

      return {
        data,
        meta: {
          totalItems: total,
          itemCount: data.length,
          totalPages: Math.ceil(total / limit),
          currentPage: Number(page),
        },
      };
    } catch (e) {
      // (ERROR_FIXES R-20): un fallo interno de la DB es un 500, no un 400;
      // el mensaje genérico se mantiene y el detalle se loguea
      this.logger.error(
        'No se pudieron obtener las propiedades',
        e instanceof Error ? e.stack : String(e),
      );
      throw new InternalServerErrorException(
        'No se pudieron obtener las propiedades',
      );
    }
  }
  
  /**
   * Detalle público de una propiedad.
   *
   * 🔒 Dos cambios respecto de la versión anterior, que cargaba las relaciones
   * enteras con `relations: [...]`:
   *
   *  1. `agent` y `referredBy` se cargan con `leftJoin` + `AGENT_PUBLIC_FIELDS`.
   *     Antes viajaba el `User` completo (email, tokenVersion, flags internos)
   *     en un endpoint sin autenticación.
   *  2. `favorites` ya NO se devuelve. Traía la lista cruda de la tabla puente
   *     (`[{user_id: 7, property_id: 16}, ...]`), o sea QUIÉNES marcaron la
   *     propiedad como favorita — comportamiento de terceros expuesto a
   *     cualquier visitante anónimo. Se reemplaza por `favoritesCount`, que es
   *     lo único que la UI necesita.
   */
  async findOne(id: number): Promise<any> {
    const property = await this.propertyRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.typeOfProperty', 'type')
      .leftJoinAndSelect('p.images', 'images')
      .leftJoinAndSelect('p.comments', 'comments')
      .leftJoinAndSelect('p.ratings', 'ratings')
      .leftJoin('p.agent', 'agent')
      .addSelect(AGENT_PUBLIC_FIELDS.map((f) => `agent.${f}`))
      .leftJoin('p.referredBy', 'referredBy')
      .addSelect(AGENT_PUBLIC_FIELDS.map((f) => `referredBy.${f}`))
      .where('p.id = :id', { id })
      // Galería en el orden que eligió el admin por drag & drop. `id` desempata
      // las filas que todavía conservan el `order: 0` del default de la
      // migración (todas las imágenes cargadas antes de que existiera la
      // columna), y así el resultado es determinista incluso sin reordenar.
      // Acá se puede poner el ORDER BY sobre la relación sin riesgo porque esta
      // query no pagina: en `findAll()` y `filter()`, que sí usan skip/take, la
      // paginación DISTINCT de TypeORM rechaza ordenar por una columna joineada
      // — ahí el orden se aplica en memoria (ver `sortImages`).
      .orderBy('images.order', 'ASC')
      .addOrderBy('images.id', 'ASC')
      .getOne();

    if (!property) {
      throw new NotFoundException(`No existe la propiedad con ID ${id}`);
    }

    const favoritesCount = await this.propertyRepo
      .createQueryBuilder('p')
      .leftJoin('p.favorites', 'f')
      .select('COUNT(f.property_id)', 'n')
      .where('p.id = :id', { id })
      .getRawOne<{ n: string }>();


    const { avg } = await this.propertyRepo
    .createQueryBuilder('property')
    .leftJoin('property.ratings', 'rating')
    .select('AVG(rating.score)', 'avg')
    .where('property.id = :id', { id })
    .getRawOne();

    return {
      ...property,
      ratingAverage: Number(avg) || 0,
      favoritesCount: Number(favoritesCount?.n ?? 0),
    };
  }
  
  // -------------------------
  // Crear property + images
  // -------------------------
async createWithImages(dto: CreatePropertyDto, images: MulterFile[], agentId?: number) {
  // 0) Mapear typeOfProperty si viene en el DTO
  if (dto.typeOfPropertyId) {
    const type = await this.propertyTypeRepo.findOne({ where: { id: dto.typeOfPropertyId } });
    if (!type) {
      throw new NotFoundException(`No existe el tipo de propiedad con ID ${dto.typeOfPropertyId}`);
    }
    // Asignar objeto completo al DTO para que TypeORM cree la relación
    (dto as any).typeOfProperty = type;
  }

  // 1) Crear y salvar la propiedad básica
  const property = this.propertyRepo.create(dto);

  // (ERROR_FIXES R-27): la property queda vinculada al admin que la crea —
  // antes el campo agent quedaba null
  if (agentId) {
    property.agent = { id: agentId } as User;
  }

  await this.propertyRepo.save(property);

  // 2) Subir y guardar imágenes si las hay (delegado)
  // 🔔 (M7): antes había un return temprano cuando no venían imágenes que
  // salteaba el disparo de notificaciones — ahora se notifica SIEMPRE
  let savedImages: PropertyImages[] = [];
  if (images && images.length > 0) {
    try {
      savedImages = await this.propertyImagesService.createMany(property, images);
      property.images = savedImages;
    } catch (error) {
      // 🧱 ROLLBACK MANUAL (ERROR_FIXES): si Cloudinary falla acá, la
      // property ya quedó guardada en el paso 1 — la borramos (junto con
      // cualquier imagen que sí haya alcanzado a persistirse) para no dejar
      // una publicación huérfana, y respondemos 502 honesto.
      this.logger.error(
        `Fallo al procesar imágenes; rollback de property ${property.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      try {
        await this.propertyImagesService.deleteAllByPropertyId(property.id);
        await this.propertyRepo.delete(property.id);
      } catch (rollbackError) {
        this.logger.error(
          `Rollback incompleto de property ${property.id} — revisar manualmente`,
          rollbackError instanceof Error ? rollbackError.stack : String(rollbackError),
        );
      }
      throw new BadGatewayException('No se pudieron procesar las imágenes. Intentá de nuevo.');
    }
  }

  // 3) Recargar la propiedad COMPLETA con relaciones necesarias para el mail
  const fullProperty = await this.propertyRepo.findOne({
    where: { id: property.id },
    relations: [
      'typeOfProperty',
      'images',
      'agent',
      'referredBy'
    ],
  });

  if (!fullProperty) {
    throw new NotFoundException('Error interno: no se pudo recargar la propiedad');
  }

  // 4) Disparar notificaciones en background (tenga o no imágenes)
  this.notificationService.handleNewProperty(fullProperty).catch(err => {
    console.error('Error enviando notificaciones para propiedad recién creada:', err);
  });

  // 5) Devolver la representación del recurso creada
  return {
    ...property,
    images: savedImages.map(img => ({
      id: img.id,
      url: img.url,
      hash: img.hash,
      isCover: img.isCover,
      // El frontend necesita el `order` de vuelta para poder mandar el reorder
      // inmediatamente después de crear, sin tener que releer la propiedad.
      order: img.order,
      publicId: img.publicId
    }))
  };
}



  // -------------------------
  // UPDATE property (delegando imagenes)
  // -------------------------
  async update(
  id: number,
  dto: UpdatePropertyDto,
  newImages?: MulterFile[],
  deleteImagesIds?: number[],
): Promise<Property> {
  const property = await this.propertyRepo.findOne({
    where: { id },
    relations: ['images', 'typeOfProperty', 'agent']
  });

  if (!property) throw new NotFoundException(`No existe la propiedad con ID ${id}`);

  // (ERROR_FIXES): validar el tipo también en update — antes un id
  // inexistente violaba la FK y salía como 500 (create ya lo validaba)
  if (dto.typeOfPropertyId) {
    const type = await this.propertyTypeRepo.findOne({ where: { id: dto.typeOfPropertyId } });
    if (!type) {
      throw new NotFoundException(`No existe el tipo de propiedad con ID ${dto.typeOfPropertyId}`);
    }
    property.typeOfProperty = type;
  }

  // Capturar precio antiguo ANTES de cambiar
  const oldPrice = property.price;

  // Actualizar campos (no persistir todavía)
  Object.assign(property, dto);

  // (ERROR_FIXES R-11): los borrados en Cloudinary son IRREVERSIBLES — van
  // al final, después de que la subida de imágenes nuevas y el save de la
  // property hayan tenido éxito. Antes, un fallo a mitad de camino dejaba
  // imágenes ya destruidas y cambios sin guardar.

  // 1) Subir imágenes nuevas (si falla acá, no se destruyó nada)
  if (newImages && newImages.length > 0) {
    const added = await this.propertyImagesService.createMany(property, newImages);
    property.images = [...(property.images || []), ...added];
  }

  // 2) Guardar los cambios de la property
  await this.propertyRepo.save(property);

  // 3) Recién ahora los borrados irreversibles
  if (deleteImagesIds && deleteImagesIds.length > 0) {
    await this.propertyImagesService.deleteManyByIds(deleteImagesIds);
    property.images = property.images?.filter(i => !deleteImagesIds.includes(i.id));
  }

  if (dto.setCoverImageId) {
    await this.propertyImagesService.setAsCover(dto.setCoverImageId);
  }

  await this.propertyImagesService.ensureCoverExists(id);

  // Notificar si cambió el precio: hacemos el handle después del save y en background
  if (dto.price && dto.price !== oldPrice) {
    this.notificationService.handlePriceChange(property, oldPrice).catch(err => {
      console.error('Error notificando baja de precio:', err);
    });
  }

  return this.findOne(id); 
}


  // -------------------------
  // DELETE property -> delegar eliminación de imágenes también
  // -------------------------
  async remove(id: number) {
    const property = await this.propertyRepo.findOne({
      where: { id },
      relations: ['images'],
    });

    if (!property) throw new NotFoundException(`No existe la propiedad con ID ${id}`);

    // (ERROR_FIXES R-12): primero la DB — el ON DELETE CASCADE elimina los
    // registros de imágenes junto con la property. La limpieza en Cloudinary
    // (irreversible) va al final y es best-effort: si falla, la operación
    // principal ya tuvo éxito y solo se loguea.
    await this.propertyRepo.delete(id);

    for (const img of property.images ?? []) {
      try {
        await this.cloudinaryService.deleteFile(img.publicId);
      } catch (cleanupError) {
        this.logger.error(
          `No se pudo limpiar en Cloudinary la imagen ${img.publicId} de la propiedad ${id}`,
          cleanupError instanceof Error ? cleanupError.stack : String(cleanupError),
        );
      }
    }

    return { message: `Propiedad ${id} eliminada correctamente` };
  }

  // -------------------------------------------------------------
  // eliminar una imagen individual (si todavia querés mantener endpoint en PropertiesController)
  // -------------------------------------------------------------
  async deleteImage(imageId: number) {
    // delega al servicio de imágenes — esto reasignará portada si hace falta
    return this.propertyImagesService.deleteImage(imageId);
  }

  // Traer la Localidad, Barrio y Zona para incluir los valores reales en los Selects de los filtros
  async getLocationFilters() {
  const localidades = await this.propertyRepo
    .createQueryBuilder('p')
    .select('DISTINCT p.localidad', 'localidad')
    .orderBy('p.localidad', 'ASC')
    .getRawMany();

  const barrios = await this.propertyRepo
    .createQueryBuilder('p')
    .select('DISTINCT p.barrio', 'barrio')
    .orderBy('p.barrio', 'ASC')
    .getRawMany();

  const zones = await this.propertyRepo
    .createQueryBuilder('p')
    .select('DISTINCT p.zone', 'zone')
    .orderBy('p.zone', 'ASC')
    .getRawMany();

  return {
    localidades: localidades.map(l => l.localidad).filter(Boolean),
    barrios: barrios.map(b => b.barrio).filter(Boolean),
    zones: zones.map(z => z.zone).filter(Boolean),
  };
}

  // ... filter() se mantiene igual que lo tenías
async filter(filters: PropertyFilterDto) {
  const {
    page = 1,
    limit = 10,
    search,
    status,
    rooms,
    bathrooms,
    minPrice,
    maxPrice,
    typeOfPropertyId,
    garage,
    patio,
    operationType,
    barrio,
    direccion,
    property_deed,
    tractoAbreviado,
    boleto,
    localidad,
    provincia,
    zone,
    maxAntiquity,
    minSupTotal,
    maxSupTotal,
    minSupCubierta,
    maxSupCubierta,
    minExpensas,
    maxExpensas,
    sortBy,
    order,
  } = filters;

  const skip = (page - 1) * limit;

  const qb = this.propertyRepo.createQueryBuilder('p')
    .leftJoinAndSelect('p.typeOfProperty', 'type')
    .leftJoinAndSelect('p.images', 'images')
    // 🔒 El agente va con campos públicos, no con la relación entera: este
    // endpoint es @Public() y antes devolvía su email y su tokenVersion.
    .leftJoin('p.agent', 'agent')
    .addSelect(AGENT_PUBLIC_FIELDS.map((f) => `agent.${f}`));

  // --- 1. PROCESAMIENTO DE BÚSQUEDA INTELIGENTE (NLP) ---
  let searchRemaining = "";
  
  if (search && search.trim() !== "") {
    let s = decodeURIComponent(search).toLowerCase()
            .replace(/²/g, '2')
            .replace(/\s+/g, ' ')
            .trim();

    // A) DETECCIÓN DE TIPOS (Prioridad nombres largos para evitar cortes en Regex)
    // (ERROR_FIXES): ILIKE en vez de = — type.name es texto libre cargado por
    // el admin (no un enum fijo), "Departamento" no matcheaba contra 'departamento'
    if (!typeOfPropertyId) {
      if (s.match(/\b(departamentos|departamento|deptos|depto)\b/i)) qb.andWhere('type.name ILIKE :tName', { tName: 'departamento' });
      else if (s.match(/\b(casas|casa)\b/i)) qb.andWhere('type.name ILIKE :tName', { tName: 'casa' });
      else if (s.match(/\b(locales|local|comercio|negocio)\b/i)) qb.andWhere('type.name ILIKE :tName', { tName: 'local' });
      else if (s.match(/\b(oficinas|oficina)\b/i)) qb.andWhere('type.name ILIKE :tName', { tName: 'oficina' });
      else if (s.match(/\b(baldío|baldio|terrenos|terreno|lotes|lote)\b/i)) qb.andWhere('type.name ILIKE :tName', { tName: 'baldío' });
    }

    // B) DETECCIÓN DE OPERACIÓN
    if (!operationType) {
      if (s.match(/\b(alquileres|alquiler|alquila|alquilo|renta)\b/i)) qb.andWhere('p.operationType = :opText', { opText: 'alquiler' });
      else if (s.match(/\b(ventas|venta|vende|vendo|comprar)\b/i)) qb.andWhere('p.operationType = :opText', { opText: 'venta' });
    }

    // C) EXTRAER METROS CUADRADOS
    // El lenguaje natural del usuario sigue siendo "metros"/"m2" (no cambia la UX
    // de búsqueda), pero el campo contra el que se filtra ahora es supTotal.
    const m2Match = s.match(/(\d+)\s*(metros cuadrados|metro cuadrado|metros|metro|mts|mt|m2)/i);
    if (m2Match) {
      const metros = parseInt(m2Match[1]);
      qb.andWhere('p.supTotal BETWEEN :mMin AND :mMax', { mMin: metros * 0.9, mMax: metros * 1.1 });
      s = s.replace(m2Match[0], '');
    }

    

    // D) EXTRAER HABITACIONES (Orden correcto: Largo primero)
    // (ERROR_FIXES): si ya vino un filtro explícito de rooms, no aplicar el
    // match del NLP — evita un AND contradictorio (ej. search="3 habitaciones" + rooms=2).
    // El s.replace() se hace SIEMPRE que haya match (aunque no se aplique el
    // where) para no dejar el número suelto colando como búsqueda de texto libre.
    const roomsMatch = s.match(/(\d+)\s*(habitaciones|habitacion|dormitorios|dormitorio|cuartos|cuarto|rooms|room|hab)/i);
    if (roomsMatch) {
      if (!rooms) qb.andWhere('p.rooms = :rSearch', { rSearch: parseInt(roomsMatch[1]) });
      s = s.replace(roomsMatch[0], '');
    }

    // E) EXTRAER BAÑOS (Orden correcto: Largo primero)
    // (ERROR_FIXES): mismo criterio que rooms — el filtro explícito manda solo,
    // pero el texto matcheado igual se limpia de `s`
    const bathsMatch = s.match(/(\d+)\s*(baños|baño|banos|bano|toilets|toilet|bañ|ban)/i);
    if (bathsMatch) {
      if (!bathrooms) qb.andWhere('p.bathrooms = :bSearch', { bSearch: parseInt(bathsMatch[1]) });
      s = s.replace(bathsMatch[0], '');
    }

    // F) EXTRAER PRECIO Y ANTIGÜEDAD
    const priceMatch = s.match(/(\d+)\s*(k|mil|usd|pesos|dolares|dólares|dolar|dólar)/i);
    const priceBigMatch = s.match(/(\d{5,})/);
    if (priceMatch || priceBigMatch) {
      let val = 0; let mTxt = "";
      if (priceMatch) {
        val = parseInt(priceMatch[1]);
        if (s.includes('k') || s.includes('mil')) val *= 1000;
        mTxt = priceMatch[0];
      } else if (priceBigMatch) {
        val = parseInt(priceBigMatch[1]);
        mTxt = priceBigMatch[0];
      }
      if (val >= 1000) {
        qb.andWhere('p.price BETWEEN :pMin AND :pMax', { pMin: val * 0.8, pMax: val * 1.2 });
        s = s.replace(mTxt, '');
      }
    }

    const antiMatch = s.match(/(\d+)\s*(antigüedad|antiguedad|años|año|anos|ano)/i);
    if (antiMatch) {
      qb.andWhere('p.antiquity <= :aSearch', { aSearch: parseInt(antiMatch[1]) });
      s = s.replace(antiMatch[0], '');
    }

    // G) LIMPIEZA DE RUIDO (Añadí "en", "con", etc., para que solo quede el lugar)
    const noise = /\b(en|con|de|un|una|tenga|que|busco|necesito|casa|depto|departamento|venta|alquiler|local|oficina|baldío|baldio|habitacion|habitaciones|baño|baños|bano|banos|dormitorio|dormitorios|cuarto|cuartos|vende|alquila|metros|m2)\b/gi;
    searchRemaining = s.replace(noise, '').replace(/\s+/g, ' ').trim();
  }

  // --- 2. FILTROS EXPLÍCITOS (Los que vienen de los selectores o inputs directos) ---
  if (rooms) qb.andWhere('p.rooms = :rooms', { rooms });
  if (bathrooms) qb.andWhere('p.bathrooms = :bathrooms', { bathrooms });
  if (typeOfPropertyId) qb.andWhere('type.id = :typeId', { typeId: typeOfPropertyId });
  if (operationType) qb.andWhere('p.operationType = :opType', { opType: operationType });
  if (minPrice) qb.andWhere('p.price >= :minPrice', { minPrice });
  if (maxPrice) qb.andWhere('p.price <= :maxPrice', { maxPrice });
  if (minSupTotal) qb.andWhere('p.supTotal >= :minSupTotal', { minSupTotal });
  if (maxSupTotal) qb.andWhere('p.supTotal <= :maxSupTotal', { maxSupTotal });
  if (minSupCubierta) qb.andWhere('p.supCubierta >= :minSupCubierta', { minSupCubierta });
  if (maxSupCubierta) qb.andWhere('p.supCubierta <= :maxSupCubierta', { maxSupCubierta });
  if (maxAntiquity) qb.andWhere('p.antiquity <= :maxAntiquity', { maxAntiquity });

  // ── EXPENSAS ──
  // `minExpensas` deja afuera las propiedades sin expensas cargadas
  // (`NULL >= x` es NULL, o sea falso): no cumplen "al menos X de expensas".
  if (minExpensas) qb.andWhere('p.expensas >= :minExpensas', { minExpensas });

  // `maxExpensas` SÍ las incluye, a propósito. Quien pone un tope de expensas
  // está limitando su gasto mensual, y una propiedad sin expensas es el mejor
  // caso posible para ese criterio — esconderla sería justo lo contrario de lo
  // que pidió. Sin el `IS NULL` explícito, el `<=` las descartaría en silencio.
  if (maxExpensas) {
    qb.andWhere('(p.expensas IS NULL OR p.expensas <= :maxExpensas)', { maxExpensas });
  }

  // Ubicación Manual
  if (barrio) qb.andWhere('unaccent(p.barrio) ILIKE unaccent(:barrio)', { barrio: `%${barrio}%` });
  if (direccion) qb.andWhere('unaccent(p.direccion) ILIKE unaccent(:direccion)', { direccion: `%${direccion}%` });
  if (localidad) qb.andWhere('unaccent(p.localidad) ILIKE unaccent(:localidad)', { localidad: `%${localidad}%` });
  if (provincia) qb.andWhere('unaccent(p.provincia) ILIKE unaccent(:provincia)', { provincia: `%${provincia}%` });
  if (zone) qb.andWhere('unaccent(p.zone) ILIKE unaccent(:zone)', {zone: `%${zone}%`,});

  // Booleanos
  if (garage !== undefined) {
    const hasGarage = String(garage) === 'true';
    qb.andWhere('p.garage = :hasGarage', { hasGarage });
  }
  if (patio !== undefined) {
    const hasPatio = String(patio) === 'true';
    qb.andWhere('p.patio = :hasPatio', { hasPatio });
  } 

  if (property_deed !== undefined) {
  const hasDeed = String(property_deed) === 'true';
  qb.andWhere('p.property_deed = :hasDeed', { hasDeed });
}

  if (tractoAbreviado !== undefined) {
    const hasTracto = String(tractoAbreviado) === 'true';
    qb.andWhere('p.tractoAbreviado = :hasTracto', { hasTracto });
  }

  if (boleto !== undefined) {
    const hasBoleto = String(boleto) === 'true';
    qb.andWhere('p.boleto = :hasBoleto', { hasBoleto });
  }

  // --- 3. BÚSQUEDA TEXTUAL (PRIORIDAD LOCALIDAD) ---
  if (searchRemaining.length >= 1) {
    qb.andWhere(new Brackets(inner => {
      // Moví Localidad y Barrio al principio para que tengan prioridad sobre el título
      inner.where("unaccent(p.localidad) ILIKE unaccent(:cs)", { cs: `%${searchRemaining}%` })
           .orWhere("unaccent(p.barrio) ILIKE unaccent(:cs)", { cs: `%${searchRemaining}%` })
           .orWhere("unaccent(p.title) ILIKE unaccent(:cs)", { cs: `%${searchRemaining}%` })
           .orWhere("unaccent(p.description) ILIKE unaccent(:cs)", { cs: `%${searchRemaining}%` });
    }));
  }

  // Solo mostrar disponibles
  qb.andWhere('p.status = :status', { status: status || StatusProperty.DISPONIBLE });

  // Paginación y Orden
  // El `order` viene del catálogo (ASC/DESC). El default sin `sortBy` sigue
  // siendo created_at DESC (más recientes primero), igual que antes.
  const dir: 'ASC' | 'DESC' = order === 'ASC' ? 'ASC' : 'DESC';
  switch (sortBy) {
    case 'price':
      qb.orderBy('p.price', dir);
      break;
    case 'antiquity':
      qb.orderBy('p.antiquity', dir);
      break;
    case 'rating':
      // Promedio de valoraciones vía subconsulta correlacionada. Se expone como
      // columna con alias (`addSelect`) y se ordena por el alias: con la
      // paginación DISTINCT de TypeORM (por el join one-to-many de imágenes),
      // ordenar por una subconsulta cruda tira "alias not found" — el alias
      // seleccionado sí lo resuelve.
      qb.addSelect(
        '(SELECT COALESCE(AVG(r.score), 0) FROM ratings r WHERE r."propertyId" = p.id)',
        'avgscore',
      ).orderBy('avgscore', dir);
      break;
    case 'date':
    default:
      qb.orderBy('p.created_at', dir);
      break;
  }
  qb.skip(skip).take(limit);

  const [items, total] = await qb.getManyAndCount();

  // El frontend necesita `ratingAverage` en las tarjetas del catálogo. Antes
  // solo lo devolvía GET /properties; acá se agrega con UNA query extra para
  // toda la página (no una por propiedad).
  const data = await this.withRatingAverage(this.sortImages(items));

  return {
    data,
    meta: {
      totalItems: total,
      itemCount: items.length,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
    }
  };
}


  }