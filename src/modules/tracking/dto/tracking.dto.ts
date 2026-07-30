import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RecordVisitDto {
  /** Ruta visitada, ej. "/properties/4". */
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  path: string;
}

export class RecordDurationDto {
  /** Id devuelto por `POST /tracking/visit`. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  visitId: number;

  /** Milisegundos que el visitante estuvo en la página. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMs: number;
}
