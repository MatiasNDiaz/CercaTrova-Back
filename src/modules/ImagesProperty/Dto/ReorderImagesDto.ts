import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Body de `PATCH /property-images/:propertyId/reorder`.
 *
 * Se eligió mandar **solo los ids en el orden deseado** en vez de una lista de
 * `{ id, order }`: la posición ya está codificada en el índice del array, así
 * que el par explícito sería información redundante que además puede llegar
 * inconsistente (dos imágenes con `order: 0`, huecos en la secuencia, un orden
 * negativo). Con ids sueltos ese estado inválido es irrepresentable.
 *
 * El array tiene que traer **todas** las imágenes de la propiedad — ver la
 * validación en `PropertyImagesService.reorder()` y su docstring.
 */
export class ReorderImagesDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Hay que mandar al menos una imagen' })
  @Type(() => Number)
  @IsInt({ each: true, message: 'imageIds debe ser un array de ids numéricos' })
  imageIds: number[];
}
