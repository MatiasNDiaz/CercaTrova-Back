// src/modules/PropertyRequest/dto/enumsPropertyRequest.ts
// (ERROR_FIXES): enums para los campos de texto libre del DTO de solicitudes.
// Los valores calcan EXACTAMENTE lo que envían los dropdowns del frontend
// (verificado contra los datos reales de la DB) — la columna de la entidad
// sigue siendo string, así que las filas existentes no se ven afectadas.

export enum TipoPropiedadRequest {
  CASA = 'Casa',
  DEPARTAMENTO = 'Departamento',
  TERRENO = 'Terreno',
  LOCAL = 'Local',
  OFICINA = 'Oficina',
  QUINTA = 'Quinta',
}

export enum TipoOperacionRequest {
  VENTA = 'Venta',
  ALQUILER = 'Alquiler',
  ALQUILER_TEMPORAL = 'Alquiler temporal',
}

export enum EstadoConservacionRequest {
  EXCELENTE = 'Excelente',
  MUY_BUENO = 'Muy bueno',
  BUENO = 'Bueno',
  REGULAR = 'Regular',
  A_REFACCIONAR = 'A refaccionar',
}
