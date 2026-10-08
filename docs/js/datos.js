/**
 * ============================================================================
 *  DATOS.JS - Donde vive la informacion dentro del telefono
 * ============================================================================
 *  No hay servidor: todo se guarda en IndexedDB, que es el almacen que el
 *  navegador mantiene PARA ESE DISPOSITIVO. Nada sale de aqui.
 *
 *  Cada usuario tiene su PROPIA base de datos, asi varias personas pueden
 *  usar la app en el mismo celular sin mezclar sus prestamos:
 *
 *      kv        -> usuarios, sesion activa
 *      bases     -> la base SQLite de cada usuario
 *      respaldos -> instantaneas de respaldo de cada usuario
 * ============================================================================
 */

const NOMBRE_ALMACEN = 'prestamos-prestamos-su';
const VERSION = 1;

let almacen = null;

export function abrirAlmacen() {
  if (almacen) return Promise.resolve(almacen);
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(NOMBRE_ALMACEN, VERSION);
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      if (!bd.objectStoreNames.contains('kv')) bd.createObjectStore('kv');
      if (!bd.objectStoreNames.contains('bases')) bd.createObjectStore('bases');
      if (!bd.objectStoreNames.contains('respaldos')) bd.createObjectStore('respaldos');
    };
    peticion.onsuccess = () => { almacen = peticion.result; resolver(almacen); };
    peticion.onerror = () => rechazar(new Error('No se pudo abrir el almacen del telefono.'));
  });
}

/**
 * Ejecuta una operacion sobre un store. Devuelve lo que produjo la accion,
 * esperando a que IndexedDB termine la transaccion (asi nunca se pierde).
 */
async function transaccion(nombre, modo, accion) {
  const bd = await abrirAlmacen();
  return new Promise((resolver, rechazar) => {
    let tx;
    try {
      tx = bd.transaction(nombre, modo);
    } catch (e) { rechazar(e); return; }
    const store = tx.objectStore(nombre);
    let resultado;
    try { resultado = accion(store); } catch (e) { rechazar(e); return; }
    const esPeticion = resultado && typeof resultado === 'object' && 'onsuccess' in resultado;
    if (esPeticion) {
      let valor;
      resultado.onsuccess = () => { valor = resultado.result; };
      tx.oncomplete = () => resolver(valor);
    } else {
      tx.oncomplete = () => resolver(resultado);
    }
    tx.onerror = () => rechazar(tx.error || new Error('Error al guardar en el telefono.'));
    tx.onabort = () => rechazar(tx.error || new Error('Se cancelo la operacion.'));
  });
}

/* ------------------------------- clave/valor ------------------------------ */

export async function kvLeer(clave, porDefecto = null) {
  const valor = await transaccion('kv', 'readonly', (s) => s.get(clave));
  return valor === undefined ? porDefecto : valor;
}

export function kvGuardar(clave, valor) {
  return transaccion('kv', 'readwrite', (s) => s.put(valor, clave));
}

export function kvBorrar(clave) {
  return transaccion('kv', 'readwrite', (s) => s.delete(clave));
}

/* ------------------------------- bases SQLite ----------------------------- */

export async function cargarBase(usuario) {
  const bytes = await transaccion('bases', 'readonly', (s) => s.get(usuario));
  return bytes instanceof Uint8Array ? bytes : null;
}

export function guardarBase(usuario, bytes) {
  // Copiamos: sql.js devuelve una vista sobre su memoria, que puede cambiar.
  const copia = Uint8Array.from(bytes);
  return transaccion('bases', 'readwrite', (s) => s.put(copia, usuario));
}

export function borrarBase(usuario) {
  return transaccion('bases', 'readwrite', (s) => s.delete(usuario));
}

/* --------------------------------- respaldos ------------------------------ */

function claveRespaldo(usuario, nombre) { return `${usuario}::${nombre}`; }

function listaDeRespaldos(usuario, todasLasClaves) {
  const prefijo = `${usuario}::`;
  return todasLasClaves
    .filter((k) => typeof k === 'string' && k.startsWith(prefijo))
    .map((k) => k.slice(prefijo.length));
}

export async function guardarRespaldo(usuario, nombre, bytes) {
  const copia = Uint8Array.from(bytes);
  const fecha = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await transaccion('respaldos', 'readwrite', (s) => s.put({ bytes: copia, fecha }, claveRespaldo(usuario, nombre)));
  return { nombre, bytes: copia.length, fecha };
}

export async function informacionRespaldos(usuario) {
  const claves = await transaccion('respaldos', 'readonly', (s) => s.getAllKeys());
  const propias = listaDeRespaldos(usuario, claves);
  const filas = await transaccion('respaldos', 'readonly', (s) => Promise.all(propias.map((k) => s.get(k))));
  return propias
    .map((k, i) => ({
      nombre: k,
      bytes: filas[i] && filas[i].bytes ? filas[i].bytes.length : 0,
      fecha: (filas[i] && filas[i].fecha) || '',
    }))
    .sort((a, b) => b.nombre.localeCompare(a.nombre));
}

export async function cargarRespaldo(usuario, nombre) {
  const fila = await transaccion('respaldos', 'readonly', (s) => s.get(claveRespaldo(usuario, nombre)));
  return fila && fila.bytes instanceof Uint8Array ? fila.bytes : null;
}

export async function limpiarRespaldos(usuario, maximo) {
  const claves = await transaccion('respaldos', 'readonly', (s) => s.getAllKeys());
  const propias = listaDeRespaldos(usuario, claves).sort().reverse();
  const viejos = propias.slice(maximo);
  if (!viejos.length) return 0;
  await transaccion('respaldos', 'readwrite', (s) => {
    for (const n of viejos) s.delete(claveRespaldo(usuario, n));
  });
  return viejos.length;
}

export async function borrarRespaldos(usuario) {
  const claves = await transaccion('respaldos', 'readonly', (s) => s.getAllKeys());
  const propias = listaDeRespaldos(usuario, claves);
  if (!propias.length) return;
  await transaccion('respaldos', 'readwrite', (s) => {
    for (const n of propias) s.delete(claveRespaldo(usuario, n));
  });
}

/* ------------------- guardado diferido de la base activa ------------------ */

let pendiente = null;
let temporizador = null;

/**
 * Guarda la base en el telefono. Se aplaza un poco para no escribir en cada
 * pequeño clic, pero se fuerza al salir de la app para no perder nada.
 */
export function programarGuardado(obtenerBytes, usuario, retraso = 400) {
  pendiente = { obtenerBytes, usuario };
  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(() => { void guardarAhora(); }, retraso);
}

export async function guardarAhora() {
  if (temporizador) { clearTimeout(temporizador); temporizador = null; }
  if (!pendiente) return;
  const { obtenerBytes, usuario } = pendiente;
  pendiente = null;
  try {
    const bytes = obtenerBytes();
    if (bytes && usuario) await guardarBase(usuario, bytes);
  } catch (e) {
    console.warn('No se pudo guardar en el telefono:', e);
  }
}

/** Al cerrar o minimizar, guardamos lo que quede pendiente. */
export function instalarGuardadoDeSalida() {
  const forzar = () => { void guardarAhora(); };
  window.addEventListener('pagehide', forzar);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') forzar();
  });
}
