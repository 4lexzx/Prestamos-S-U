/**
 * ============================================================================
 *  AUTH.JS - Quien usa la aplicacion en este telefono
 * ============================================================================
 *  No hay pantalla de acceso: la app se abre directa. En este telefono solo
 *  hay UNA persona usando la app, asi que el nombre del usuario es un simple
 *  identificador interno con el que se separan los archivos guardados.
 *
 *  Para que una actualizacion no borre lo que ya tenias, se respeta el
 *  usuario que ya estuviera guardado en el telefono; solo si no hay ninguno
 *  (instalacion nueva) se usa el nombre fijo "principal".
 * ============================================================================
 */

import { kvLeer, kvGuardar } from './datos.js';

const CLAVE_SESION = 'prestamos-su:usuario-activo';
const USUARIO_FIJO = 'principal';

function leerSesion() {
  try { return localStorage.getItem(CLAVE_SESION) || null; } catch { return null; }
}

function guardarSesion(nombre) {
  try { localStorage.setItem(CLAVE_SESION, nombre); } catch { /* modo privado */ }
}

/**
 * El nombre del usuario de este telefono.
 *
 * 1. Si ya hay uno guardado (la app ya se usaba antes), se sigue usando ese:
 *    asi una actualizacion no deja los datos de lado.
 * 2. Si no, pero en el telefono quedaron usuarios de una version anterior
 *    (la que tenia candado de clave), se toma el primero que se creo.
 * 3. Si no hay nada, se usa el nombre fijo y se guarda.
 */
export async function usuarioActual() {
  const guardado = leerSesion();
  if (guardado) return guardado;

  let nombre = USUARIO_FIJO;
  try {
    const usuarios = await kvLeer('usuarios', []);
    if (Array.isArray(usuarios) && usuarios.length) nombre = usuarios[0].nombre;
  } catch { /* sin almacenamiento todavia */ }

  guardarSesion(nombre);
  return nombre;
}
