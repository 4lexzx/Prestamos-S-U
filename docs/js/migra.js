/**
 * ============================================================================
 *  MIGRA.JS - Llevar los datos de un equipo a otro
 * ============================================================================
 *  Dos direcciones:
 *
 *   - IMPORTAR la base original del sistema de PC (prestamos.db): para
 *     empezar a usar la aplicacion en el telefono con los datos ya
 *     creados en la laptop.
 *   - EXPORTAR / IMPORTAR un respaldo JSON: para mover los datos entre
 *     navegadores o guardarlos en la nube del usuario sin que nadie mas
 *     pueda leerlos (van en base64 dentro de un archivo de texto).
 *
 *  Todo pasa por el mismo sitio: se reemplaza la base del usuario que
 *  tenga la sesion abierta.
 * ============================================================================
 */

import { guardarBase } from './datos.js';
import {
  abrirBaseDatos, cerrarBaseDatos, exportarBase, usuarioDeLaBase, baseDeDatos,
} from './negocio.js';
import { descargarArchivo } from '../api.js';

const FIRMA_SQLITE = 'SQLite format 3\0';
const APLICACION_RESPALDO = 'prestamos-su';

/** ¿Tiene la cabecera propia de un archivo SQLite? */
export function esBaseSqlite(bytes) {
  if (!bytes || bytes.length < 100) return false;
  for (let i = 0; i < FIRMA_SQLITE.length; i += 1) {
    if (bytes[i] !== FIRMA_SQLITE.charCodeAt(i)) return false;
  }
  return true;
}

function bytesABase64(bytes) {
  let trozo = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    trozo += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(trozo);
}

function base64ABytes(texto) {
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function contarTablas() {
  const fila = baseDeDatos.prepare('SELECT count(*) AS n FROM sqlite_master').get();
  return Number(fila && fila.n) || 0;
}

/**
 * Cambia la base del usuario actual por los bytes indicados.
 * Si algo sale mal, devuelve la base anterior y lanza un error claro.
 */
export async function importarBase(bytes) {
  if (!esBaseSqlite(bytes)) {
    throw new Error('Ese archivo no parece ser una base de datos (.db) de la aplicacion.');
  }
  const usuario = usuarioDeLaBase();
  if (!usuario) throw new Error('Primero abre tu usuario y tu clave.');

  const anterior = exportarBase();
  cerrarBaseDatos();
  try {
    abrirBaseDatos(bytes, usuario);
    contarTablas();
  } catch (fallo) {
    if (anterior) { try { abrirBaseDatos(anterior, usuario); } catch { /* imposible */ } }
    throw new Error(`El archivo no se pudo abrir: ${(fallo && fallo.message) || fallo}`);
  }

  const guardados = exportarBase();
  await guardarBase(usuario, guardados);
  return { tablas: contarTablas(), bytes: guardados.length };
}

/** Lee un archivo del selector y lo usa como base. */
export async function importarArchivoDb(archivo) {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  return importarBase(bytes);
}

/** Descarga un respaldo JSON con la base entera dentro. */
export function descargarRespaldo() {
  const usuario = usuarioDeLaBase() || 'usuario';
  const bytes = exportarBase();
  if (!bytes || !bytes.length) throw new Error('No hay base abierta para respaldar.');
  const contenido = JSON.stringify({
    aplicacion: APLICACION_RESPALDO,
    version: 1,
    usuario,
    fecha: new Date().toISOString(),
    base64: bytesABase64(bytes),
  }, null, 2);
  const nombre = `prestamos-respaldo-${usuario}-${new Date().toISOString().slice(0, 10)}.json`;
  descargarArchivo(nombre, contenido, 'application/json;charset=utf-8');
  return { nombre, bytes: bytes.length };
}

/** Carga un respaldo JSON y lo instala como base del usuario actual. */
export async function importarRespaldoJson(archivo) {
  let datos;
  try {
    datos = JSON.parse(await archivo.text());
  } catch {
    throw new Error('Ese archivo no es un respaldo valido (no es JSON).');
  }
  if (!datos || datos.aplicacion !== APLICACION_RESPALDO || typeof datos.base64 !== 'string') {
    throw new Error('Ese archivo no es un respaldo de esta aplicacion.');
  }
  return importarBase(base64ABytes(datos.base64));
}
