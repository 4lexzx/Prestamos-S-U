/**
 * ============================================================================
 *  API.JS - Puente con el motor de la aplicacion (sin servidor)
 * ============================================================================
 *  Es la misma fachada de siempre: los mismos metodos, con los mismos
 *  argumentos y los mismos mensajes de error. Solo cambia lo que hay
 *  debajo: en vez de hacer fetch a http://127.0.0.1:4321 llama a
 *  manejar() que ejecuta la logica del negocio dentro de la propia pagina.
 *
 *  Cada llamada que modifica datos deja programado el guardado de la base
 *  en el almacenamiento del telefono (IndexedDB) para que no se pierda
 *  nada aunque cierres la pestana.
 * ============================================================================
 */

import { manejar } from './js/rutas.js';
import { programarGuardado } from './js/datos.js';
import { exportarBase, usuarioDeLaBase } from './js/negocio.js';

const METODOS_DE_ESCRITURA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function pedir(ruta, opciones = {}) {
  const metodo = (opciones.method || 'GET').toUpperCase();

  let respuesta;
  try {
    respuesta = await manejar(ruta, metodo, opciones.cuerpo ?? {});
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error && error.message || error));
  }

  // Escritura exitosa (o de negocio) -> la base cambio, hay que guardarla.
  if (METODOS_DE_ESCRITURA.has(metodo) && respuesta && respuesta.status < 400) {
    programarGuardado(exportarBase, usuarioDeLaBase());
  }

  if (!respuesta || typeof respuesta !== 'object') {
    throw new Error('La aplicacion no devolvio respuesta.');
  }

  if (respuesta.status >= 400) {
    throw new Error(respuesta.datos && respuesta.datos.error
      || `Error de la aplicacion (${respuesta.status}).`);
  }

  return respuesta.datos ?? null;
}

/**
 * Descarga un archivo generado en la memoria del navegador. En el servidor
 * esto lo hacia el navegador solo; aqui hay que construir el blob a mano.
 */
export function descargarArchivo(nombre, texto, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob([String.fromCharCode(0xFEFF) + texto], { type: tipo });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const api = {
  estado:      ()               => pedir('/api/estado'),

  ajustes:     ()               => pedir('/api/ajustes'),
  guardarAjustes: (datos)       => pedir('/api/ajustes', { method: 'PUT', cuerpo: datos }),

  clientes:    (busqueda = '')  => pedir(`/api/clientes?q=${encodeURIComponent(busqueda)}`),
  cliente:     (id)             => pedir(`/api/clientes/${id}`),
  crearCliente: (datos)         => pedir('/api/clientes', { method: 'POST', cuerpo: datos }),
  editarCliente: (id, datos)    => pedir(`/api/clientes/${id}`, { method: 'PUT', cuerpo: datos }),
  borrarCliente: (id)           => pedir(`/api/clientes/${id}`, { method: 'DELETE' }),

  prestamos:   (filtro = 'todos', clienteId = null) => {
    const params = new URLSearchParams({ filtro });
    if (clienteId) params.set('cliente', clienteId);
    return pedir(`/api/prestamos?${params}`);
  },
  prestamo:    (id)             => pedir(`/api/prestamos/${id}`),
  simularPrestamo: (datos)      => pedir('/api/prestamos/simular', { method: 'POST', cuerpo: datos }),
  crearPrestamo: (datos)        => pedir('/api/prestamos', { method: 'POST', cuerpo: datos }),
  editarPrestamo: (id, datos)   => pedir(`/api/prestamos/${id}`, { method: 'PUT', cuerpo: datos }),
  simularEdicion: (id, datos)   => pedir(`/api/prestamos/${id}/simular`, { method: 'POST', cuerpo: datos }),
  borrarPrestamo: (id)          => pedir(`/api/prestamos/${id}`, { method: 'DELETE' }),

  pagarCuota:  (idPrestamo, numero, fechaPago = null) =>
    pedir(`/api/prestamos/${idPrestamo}/cuotas/${numero}/pagar`, {
      method: 'POST', cuerpo: fechaPago ? { fechaPago } : {},
    }),
  deshacerCuota: (idPrestamo, numero) =>
    pedir(`/api/prestamos/${idPrestamo}/cuotas/${numero}/deshacer`, { method: 'POST' }),

  crearAbono:  (idPrestamo, datos) =>
    pedir(`/api/prestamos/${idPrestamo}/abonos`, { method: 'POST', cuerpo: datos }),
  borrarAbono: (idPrestamo, idAbono) =>
    pedir(`/api/prestamos/${idPrestamo}/abonos/${idAbono}`, { method: 'DELETE' }),

  refinanciar: (idPrestamo, datos) =>
    pedir(`/api/prestamos/${idPrestamo}/refinanciar`, { method: 'POST', cuerpo: datos }),

  dashboard:   ()               => pedir('/api/dashboard'),
  capital:     ()               => pedir('/api/capital'),
  agregarCapital: (datos)       => pedir('/api/capital', { method: 'POST', cuerpo: datos }),
  borrarCapital: (id)           => pedir(`/api/capital/${id}`, { method: 'DELETE' }),

  calendario:  (mes, anio)      => pedir(`/api/calendario?mes=${mes}&anio=${anio}`),

  respaldos:   ()               => pedir('/api/respaldos'),
  crearRespaldo: ()             => pedir('/api/respaldos', { method: 'POST' }),
  restaurarRespaldo: (nombre)   => pedir('/api/respaldos/restaurar', { method: 'POST', cuerpo: { nombre } }),

  /** Devuelve { csv, nombre } y lo descarga al equipo. */
  exportarCsv: ()               => pedir('/api/exportar'),
  /** Guarda una copia del CSV en la carpeta de descargas del equipo. */
  guardarCsv:  async () => {
    const { csv, nombre } = await pedir('/api/exportar');
    descargarArchivo(nombre || 'prestamos.csv', csv);
    return { nombre, ruta: 'tus descargas' };
  },
};
