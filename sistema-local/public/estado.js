/**
 * ============================================================================
 *  ESTADO.JS - Estado compartido de la aplicación
 * ============================================================================
 *  Aquí se guardan los ajustes y la lista de "oyentes" que necesitan
 *  actualizarse cuando algo cambia (por ejemplo, al pagar una cuota).
 * ============================================================================
 */

/** Datos compartidos por todas las pantallas. */
export const app = {
  ajustes: { tasaSemana: '5', nombreNegocio: 'Mi negocio' },
  hoy: '',
  ruta: '',
};

/* --- Suscriptores: se vuelven a pintar solos cuando cambia algo --- */

const suscriptores = new Set();

/** Registra una función que se ejecutará tras cada cambio en los datos. */
export function suscribir(funcion) {
  suscriptores.add(funcion);
  return () => suscriptores.delete(funcion);
}

/** Borra los suscriptores de la pantalla anterior (lo llama el enrutador). */
export function limpiarSuscriptores() {
  suscriptores.clear();
}

/**
 * Avisa a todas las pantallas que los datos cambiaron.
 * Esto es lo que hace que al marcar una cuota como pagada se actualicen
 * AL INSTANTE el calendario, las listas, el dashboard y el capital.
 */
export function refrescar() {
  for (const funcion of suscriptores) {
    try { funcion(); } catch (error) { console.error('Error al refrescar:', error); }
  }
}

/* --- Navegación --- */

/** Cambia de pantalla (añade #/ al inicio si hace falta). */
export function ir(ruta) {
  const destino = ruta.startsWith('#') ? ruta : `#/${ruta.replace(/^\/+/, '')}`;
  if (location.hash === destino) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = destino;
  }
}

/** Vuelve a la pantalla anterior. */
export function volver() {
  if (history.length > 1) history.back();
  else ir('dashboard');
}

/* --- Datos derivados del estado --- */

export const tasaSemana = () => Number(app.ajustes.tasaSemana) || 5;
