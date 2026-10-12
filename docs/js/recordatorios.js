/**
 * ============================================================================
 *  RECORDATORIOS.JS - Avisos de cobro, el día antes y el mismo día
 * ============================================================================
 *
 *  Qué hace:
 *    1. Pide permiso para enviar notificaciones al sistema.
 *    2. Cada vez que se abre la app (o vuelve a primer plano) mira qué cuotas
 *       tocan cobrar HOY y MAÑANA, y anota el aviso en la bandeja de la app
 *       (localStorage, 1 entrada por día) sin importar los permisos.
 *    3. Si hay permiso, lanza la notificación del sistema: primero por el
 *       service worker y, si no se puede, con la notificación de la página.
 *    4. Si la app está abierta a primera hora, programa el aviso para las
 *       07:30 de la mañana siguiente.
 *    5. Deja la lista de cobros pendientes guardada en la caché para que el
 *       service worker pueda avisar también sin tener la app abierta
 *       (sincronización periódica de fondo, cuando el navegador lo permite).
 *
 *  Los avisos del sistema salen una vez por día; la bandeja guarda 1 entrada
 *  por día (como mucho 30) hasta que la vacíes.
 * ============================================================================
 */

import { api } from '../api.js';
import { avisosDeRecordatorioActivados, sonarAviso } from './sonidos.js';

/** A primera hora: 07:30. */
export const HORA_AVISO = 7;
export const MINUTO_AVISO = 30;

const CLAVE_ENVIADOS = 'prestamos.recordatorios.enviados';
const CLAVE_MOSTRADO_PERMISO = 'prestamos.recordatorios.pedido';
const CLAVE_BANDEJA = 'prestamos.bandeja';
const CACHE_AVISO = 'prestamos-recordatorios';

const dinero = (valor) => `S/ ${(Number(valor) || 0).toLocaleString('es-PE', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;

const aISO = (fecha) => fecha.toISOString().slice(0, 10);

/** Hoy en hora local, como 'YYYY-MM-DD'. */
function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sumarDias(iso, dias) {
  return aISO(new Date(Date.parse(`${iso}T00:00:00`) + dias * 86400000));
}

/* ========================================================================== *
 *  1. PERMISO
 * ========================================================================== */

export const hayNotificaciones = () => typeof Notification !== 'undefined';

export const permisoConcedido = () => hayNotificaciones() && Notification.permission === 'granted';

/** Pide permiso. Devuelve 'granted' | 'denied' | 'default' | 'no-soportado'. */
export async function pedirPermiso() {
  if (!hayNotificaciones()) return 'no-soportado';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const r = await Notification.requestPermission();
    try { localStorage.setItem(CLAVE_MOSTRADO_PERMISO, '1'); } catch { /* sin store */ }
    return r;
  } catch { return 'default'; }
}

/** Si conviene mostrar el cartelito "activa los avisos" en el dashboard. */
export function faltaPedirPermiso() {
  if (!hayNotificaciones()) return false;
  if (Notification.permission !== 'default') return false;
  if (!avisosDeRecordatorioActivados()) return false;
  try { return localStorage.getItem(CLAVE_MOSTRADO_PERMISO) !== '1'; } catch { return true; }
}

/* ========================================================================== *
 *  2. QUÉ COBROS HAY
 * ========================================================================== */

/**
 * Resume del dashboard: vencidas, las de hoy y las de mañana.
 * Devuelve { hoy, manana, vencidas, lineas, titulo, cuerpo, hayAlgo }.
 */
export function resumir(datos) {
  const hoy = datos.hoy || hoyISO();
  const manana = sumarDias(hoy, 1);

  const sumar = (lista) => lista.reduce((t, i) => t + (Number(i.monto) || 0), 0);
  const vencidas = datos.vencidas || [];
  const deHoy = datos.aCobrarHoy || [];
  const deManana = (datos.aCobrarSemana || []).filter((i) => i.fecha === manana);

  const grupo = {
    vencidas: { cantidad: vencidas.length, monto: sumar(vencidas) },
    hoy: { cantidad: deHoy.length, monto: sumar(deHoy) },
    manana: { cantidad: deManana.length, monto: sumar(deManana) },
  };

  const lineas = [];
  if (grupo.vencidas.cantidad) {
    lineas.push(`Atrasadas: ${grupo.vencidas.cantidad} · ${dinero(grupo.vencidas.monto)}`);
  }
  if (grupo.hoy.cantidad) {
    lineas.push(`Hoy: ${grupo.hoy.cantidad} cuota(s) · ${dinero(grupo.hoy.monto)}`);
  }
  if (grupo.manana.cantidad) {
    lineas.push(`Mañana: ${grupo.manana.cantidad} cuota(s) · ${dinero(grupo.manana.monto)}`);
  }

  let titulo = 'Recordatorio de cobros';
  if (grupo.hoy.cantidad) titulo = `Cobras hoy ${dinero(grupo.hoy.monto)}`;
  else if (grupo.manana.cantidad) titulo = `Mañana cobras ${dinero(grupo.manana.monto)}`;
  else if (grupo.vencidas.cantidad) titulo = `Tienes ${grupo.vencidas.cantidad} cuota(s) atrasada(s)`;

  return {
    hoy,
    manana,
    grupo,
    vencidas,
    deHoy,
    deManana,
    lineas,
    titulo,
    cuerpo: lineas.join('\n'),
    hayAlgo: lineas.length > 0,
  };
}

/* ========================================================================== *
 *  3. BANDEJA DE AVISOS (localStorage, 1 entrada por día)
 * ========================================================================== */

function avisarBandejaCambio() {
  try { window.dispatchEvent(new Event('bandeja-cambio')); } catch { /* sin window */ }
}

/** Anota el aviso del día en la bandeja de la app, ANTES de mirar permisos. */
export function anotarAviso(resumen) {
  const entrada = {
    fecha: resumen.hoy,
    titulo: resumen.titulo,
    cuerpo: resumen.cuerpo,
    lineas: resumen.lineas || [],
    creada: new Date().toISOString(),
    leida: false,
  };
  try {
    const previa = JSON.parse(localStorage.getItem(CLAVE_BANDEJA) || '[]');
    const lista = (Array.isArray(previa) ? previa : []).filter((e) => e && e.fecha !== resumen.hoy);
    lista.unshift(entrada);
    localStorage.setItem(CLAVE_BANDEJA, JSON.stringify(lista.slice(0, 30)));
  } catch { /* sin store */ }
  avisarBandejaCambio();
  return entrada;
}

/** Lista de avisos de la bandeja, del más reciente al más antiguo. */
export function leerBandeja() {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE_BANDEJA) || '[]');
    return Array.isArray(lista) ? lista.filter((e) => e && e.fecha) : [];
  } catch { return []; }
}

/** Cuántos avisos de la bandeja siguen sin leerse (la bolita de la campana). */
export function cantidadBandeja() {
  return leerBandeja().filter((e) => !e.leida).length;
}

/** Marca todos los avisos de la bandeja como leídos. */
export function marcarBandejaLeida() {
  try {
    const lista = leerBandeja().map((e) => ({ ...e, leida: true }));
    localStorage.setItem(CLAVE_BANDEJA, JSON.stringify(lista));
  } catch { /* sin store */ }
  avisarBandejaCambio();
}

/** Vacía la bandeja por completo. */
export function limpiarBandeja() {
  try { localStorage.removeItem(CLAVE_BANDEJA); } catch { /* sin store */ }
  avisarBandejaCambio();
}

/* ========================================================================== *
 *  4. AVISAR (una vez por día)
 * ========================================================================== */

function yaAvisado(fecha) {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE_ENVIADOS) || '[]');
    return Array.isArray(lista) && lista.includes(fecha);
  } catch { return false; }
}

function marcarAvisado(fecha) {
  try {
    const previo = JSON.parse(localStorage.getItem(CLAVE_ENVIADOS) || '[]');
    const lista = (Array.isArray(previo) ? previo : []).concat(fecha).slice(-45);
    localStorage.setItem(CLAVE_ENVIADOS, JSON.stringify(lista));
  } catch { /* sin store */ }
}

/**
 * Lanza una notificación del sistema.
 * Primero intenta por el service worker (aparece en la bandeja del sistema
 * aunque la app esté cerrada); si no se puede, usa la notificación de la página.
 */
export async function notificar(titulo, opciones = {}) {
  const opcionesSistema = {
    body: opciones.cuerpo || '',
    tag: opciones.tag || `recordatorio-${hoyISO()}`,
    icon: 'iconos/icono-192.png',
    badge: 'iconos/icono-192.png',
    silent: true,           // el pitido lo ponemos nosotros, suave
    renotify: false,
    data: { ruta: opciones.ruta || '#/cobrar' },
  };

  try {
    if ('serviceWorker' in navigator) {
      const registro = await navigator.serviceWorker.ready;
      await registro.showNotification(titulo, opcionesSistema);
      return true;
    }
  } catch { /* sin SW o sin permiso: probamos con la notificación de la página */ }

  try {
    const aviso = new Notification(titulo, opcionesSistema);
    aviso.onclick = () => {
      window.focus();
      location.hash = opcionesSistema.data.ruta;
      aviso.close();
    };
    return true;
  } catch { return false; }
}

/**
 * Comprueba y avisa. Es la función que llama todo el mundo.
 * @param {object} [op]  { silencioso } no pita
 */
export async function revisar(op = {}) {
  if (!avisosDeRecordatorioActivados()) return null;

  let datos;
  try { datos = await api.dashboard(); } catch { return null; }

  const resumen = resumir(datos);
  if (!resumen.hayAlgo) return null;

  // 1) Siempre va a la bandeja de la app (1 entrada por día), sin importar
  //    permisos ni avisos previos: así nunca se pierde el recordatorio.
  anotarAviso(resumen);

  // 2) Guardar para que el service worker pueda avisar si tú no abres la app
  guardarParaElServiceWorker(resumen);

  // 3) Aviso del sistema: solo con permiso y una sola vez por día
  if (!hayNotificaciones() || Notification.permission !== 'granted') return resumen;

  const clave = `${resumen.hoy}|${resumen.manana}`;
  if (yaAvisado(clave)) return resumen;
  marcarAvisado(clave);

  await notificar(resumen.titulo, {
    cuerpo: resumen.cuerpo,
    tag: `recordatorio-${resumen.hoy}`,
    ruta: '#/cobrar',
  });
  if (!op.silencioso) sonarAviso();
  return resumen;
}

/** Versión solo para el panel del dashboard: no pide permiso, no pita. */
export async function resumenDeHoy() {
  try { return resumir(await api.dashboard()); } catch { return null; }
}

/* ========================================================================== *
 *  4. DEJAR DATOS AL SERVICE WORKER
 * ========================================================================== */

/**
 * El service worker no puede consultar la base de datos (es SQLite dentro de
 * la página), así que le dejamos escrita la lista de cobros pendientes. Él la
 * lee desde la caché cuando le llama la sincronización periódica de fondo.
 */
async function guardarParaElServiceWorker(resumen) {
  if (!('caches' in window)) return;
  try {
    const pendientes = [...resumen.deHoy, ...resumen.deManana, ...resumen.vencidas].map((i) => ({
      fecha: i.fecha, monto: i.monto, cliente: i.cliente, prestamoId: i.prestamoId, numero: i.numero,
    }));
    const cache = await caches.open(CACHE_AVISO);
    await cache.put(new Request('/__recordatorios__/pendientes'), new Response(
      JSON.stringify({ actualizado: hoyISO(), pendientes, lineas: resumen.lineas }),
      { headers: { 'Content-Type': 'application/json' } },
    ));
  } catch { /* sin caché, seguimos sin esto */ }
}

/* ========================================================================== *
 *  5. CUÁNDO SE COMPRUEBA
 * ========================================================================== */

let temporizadorManana = null;

/** Programa el chequeo de las 07:30 (o de la próxima si ya pasó hoy). */
function programarPrimeraHora() {
  clearTimeout(temporizadorManana);
  const ahora = new Date();
  const objetivo = new Date();
  objetivo.setHours(HORA_AVISO, MINUTO_AVISO, 0, 0);
  if (objetivo <= ahora) objetivo.setDate(objetivo.getDate() + 1);
  const ms = Math.min(objetivo - ahora, 23 * 3600000);
  temporizadorManana = setTimeout(() => {
    revisar();
    programarPrimeraHora();
  }, ms);
}

/** Intenta la sincronización periódica de fondo (solo en apps instaladas). */
async function registrarFondo() {
  try {
    if (!('serviceWorker' in navigator) || !('periodicSync' in ServiceWorkerRegistration.prototype)) return;
    const registro = await navigator.serviceWorker.ready;
    await registro.periodicSync.register('recordatorios', { minInterval: 12 * 3600000 });
  } catch { /* el navegador no lo permite: no pasa nada */ }
}

/** Arranca todo. Se llama una sola vez al abrir la aplicación. */
export function arrancarRecordatorios() {
  if (!hayNotificaciones()) return;

  // Al abrir
  setTimeout(() => revisar(), 2500);

  // Al volver a la app (desde WhatsApp, desde otra pestaña, al desbloquear)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(() => revisar(), 1200);
  });
  window.addEventListener('focus', () => setTimeout(() => revisar(), 900));

  // A primera hora, mientras la app siga abierta
  programarPrimeraHora();

  // Fondo, cuando el navegador lo permite
  registrarFondo();
}
