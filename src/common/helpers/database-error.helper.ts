// src/common/helpers/database-error.helper.ts

// 🧱 PATRÓN (ERROR_FIXES): detección centralizada de la violación de
// constraint UNIQUE de Postgres (código 23505). Los services la capturan y
// la convierten en ConflictException (409) con un mensaje acorde al contexto,
// en vez de dejar que salga como 500 crudo.
export function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === '23505';
}
