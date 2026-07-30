/** Cómo se creó la cuenta — usado por la estadística de registros del panel. */
export enum AuthProvider {
  /** Registro con el formulario del sitio (email + contraseña). */
  LOCAL = 'local',
  /** Registro/alta automática al entrar con Google. */
  GOOGLE = 'google',
}
