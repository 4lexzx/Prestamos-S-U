/**
 * ============================================================================
 *  API.JS - Puente con el servidor local
 * ============================================================================
 *  Todas las llamadas van a http://127.0.0.1:4321 (tu propia laptop).
 *  Si el servidor no responde, la app avisa para que reinicies INICIAR.bat.
 * ============================================================================
 */

/** Mensajes en español para los errores típicos de conexión. */
const ERRORES_RED = {
  'Failed to fetch': 'No se pudo conectar con el servidor local. Cierra la ventana negra y vuelve a abrir INICIAR.bat.',
  'NetworkError': 'No se pudo conectar con el servidor local. Reinicia la app con INICIAR.bat.',
};

async function pedir(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      headers: { 'Content-Type': 'application/json' },
      ...opciones,
      body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
    });
  } catch (error) {
    throw new Error(ERRORES_RED[error.message]
      || 'No se pudo conectar con el servidor local. Reinicia la app con INICIAR.bat.');
  }

  const texto = await respuesta.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = null; }

  if (!respuesta.ok) {
    throw new Error(datos?.error || `Error del servidor (${respuesta.status}).`);
  }
  return datos;
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

  guardarCsv:  ()               => pedir('/api/exportar/guardar', { method: 'POST' }),
};
