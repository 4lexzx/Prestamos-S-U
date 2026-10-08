/**
 * ============================================================================
 *  FORMULARIO DE PRÉSTAMO
 * ============================================================================
 *  Sirve para tres cosas:
 *    1. Crear un préstamo nuevo
 *    2. Editar uno que todavía no tiene cuotas pagadas
 *    3. Refinanciar uno que ya va por la mitad
 *
 *  Mientras escribes, la VISTA PREVIA se actualiza sola: interés total, total a
 *  pagar, valor de la cuota y el reparto interés / capital de cada cuota.
 *
 *  Si el préstamo ya tiene cuotas cobradas, la vista previa cambia de reglas:
 *  te enseña cuánto llevas cobrado, cuánto capital queda por recuperar y cómo
 *  quedan las cuotas que faltan. Lo ya cobrado no se toca nunca.
 * ============================================================================
 */

import { api } from '/api.js';
import { refrescar, tasaSemana } from '/estado.js';
import {
  h, abrirModal, avisar, selectorClientes,
  formatearSoles, montoATexto, barraDesglose,
} from '/ui.js';
import { formatearFecha, hoyISO } from '/compartido/calculo.js';
import { textoAMonto } from '/compartido/moneda.js';

const FRECUENCIAS = [
  { valor: 'semanal', texto: 'Semanal (cada 7 días)' },
  { valor: 'diaria', texto: 'Diaria (cada día)' },
];

/**
 * Abre el formulario.
 * @param {object} opciones
 * @param {object|null} opciones.prestamo  Préstamo a editar (o null para crear)
 * @param {number|null}  opciones.clienteId Cliente ya elegido
 * @param {object}       opciones.valores   Valores iniciales (p. ej. al refinanciar)
 * @param {function}     opciones.alGuardar Se llama después de guardar
 */
export function abrirFormularioPrestamo({
  prestamo = null, clienteId = null, valores = {}, alGuardar = () => {},
} = {}) {
  const esEdicion = Boolean(prestamo);
  // Si ya cobró algo, la edición solo rehace lo que falta: es otro camino
  const conCobros = Boolean(prestamo?.resumen?.cuotasPagadas);
  let clienteElegido = clienteId;

/* ---------------- Campos del formulario ---------------- */

  // Al editar, los campos arrancan con lo que ya está guardado
  const montoGuardado = valores.monto !== undefined ? valores.monto : (prestamo ? prestamo.monto : '');
  const monto = h('input', { type: 'text', inputmode: 'decimal', class: 'monto',
    placeholder: '0.00', value: montoGuardado === '' || montoGuardado === null ? '' : montoATexto(montoGuardado) });

  const frecuencia = h('select', {},
    ...FRECUENCIAS.map((f) => h('option', {
      value: f.valor,
      selected: (valores.frecuencia || prestamo?.frecuencia || 'semanal') === f.valor,
    }, f.texto)));

  const numCuotas = h('input', { type: 'number', min: '1', max: '520', step: '1',
    class: 'mono-num',
    value: valores.numCuotas ?? prestamo?.num_cuotas ?? 4 });

  const fechaInicio = h('input', { type: 'date',
    value: valores.fechaInicio || prestamo?.fecha_inicio || hoyISO() });

  // El interés manual solo se propone si el préstamo se creó con tasa manual
  const tasaPrevia = valores.tasaPct !== undefined
    ? valores.tasaPct
    : (prestamo?.tasa_origen === 'manual' ? prestamo.tasa_pct : '');
  const tasaManual = h('input', {
    type: 'text', inputmode: 'decimal', class: 'monto',
    placeholder: 'Automático', value: tasaPrevia === '' || tasaPrevia === null ? '' : String(tasaPrevia),
  });

  const notas = h('textarea', { placeholder: 'Nota opcional (por ejemplo: "prestó para la tractorera")' },
    valores.notas ?? prestamo?.notas ?? '');

  const usarManual = h('input', { type: 'checkbox' });
  usarManual.checked = Boolean(prestamo?.tasa_origen === 'manual' && tasaPrevia !== '');

  /* ---------------- Zona de vista previa ---------------- */

const avisoAutomatico = h('div', { class: 'nota-info verde' });
  const avisoManual = h('div', { class: 'nota-info ambar', style: 'display:none' });
  // Explicación fija (no se borra al recalcular) y avisos del recálculo (sí)
  const avisoCobros = h('div', {});
  const avisosEdicion = h('div', {});
  const resumenRapido = h('div', { class: 'rejilla k4', style: 'margin-top:14px' });
  const zonaTabla = h('div', { class: 'tarjeta-cuerpo sin-relleno', style: 'max-height:290px;overflow-y:auto' });
  const zonaError = h('div', {});

  if (conCobros) {
    const r = prestamo.resumen;
    avisoCobros.appendChild(h('div', { class: 'nota-info azul' },
      h('b', {}, `Ya cobraste ${r.cuotasPagadas} de ${r.cuotasTotal} cuota(s) (S/ ${r.pagado}). `),
      'Lo que el cliente ya te pagó no se cambia ni se borra: al guardar, ',
      'solo se recalcula lo que falta por cobrar.'));
  }

  /* ---------------- Selector de cliente ---------------- */

  const selector = selectorClientes({
    cargar: () => api.clientes(),
    valor: clienteId ? { id: clienteId, nombre: '', telefono: '' } : null,
    onNuevo: async () => {
      const { abrirFormularioCliente } = await import('/vistas/clientes.js');
      return abrirFormularioCliente();
    },
  });
  // Si estamos editando o refinanciando, el cliente ya está decidido
  if (prestamo?.cliente) {
    api.clientes().then((lista) => {
      const encontrado = lista.find((c) => c.id === prestamo.cliente_id);
      if (encontrado) {
        selector.seleccionar(encontrado);
        clienteElegido = encontrado.id;
        refrescarVistaPrevia();
      }
    });
  }

  selector.envoltura.addEventListener('cliente-elegido', () => {
    clienteElegido = selector.obtener()?.id ?? null;
    refrescarVistaPrevia();
  });

  /* ---------------- Cálculo de la vista previa ---------------- */

  function leerDatos() {
    return {
      monto: textoAMonto(monto.value),
      frecuencia: frecuencia.value,
      numCuotas: Number(numCuotas.value),
      fechaInicio: fechaInicio.value,
      tasaPct: tasaManual.value === '' ? undefined : textoAMonto(tasaManual.value),
      usarTasaManual: usarManual.checked && tasaManual.value !== '',
      notas: notas.value,
    };
  }

  let ultimoResultado = null;
  let ultimoTemporal = null;

  async function refrescarVistaPrevia() {
    const datos = leerDatos();
    const clave = JSON.stringify(datos);

    // Si nada cambió de lo ya dibujado, no volvemos a llamar al servidor
    if (clave === ultimoTemporal) return;
    ultimoTemporal = clave;

    zonaError.replaceChildren();
    avisosEdicion.replaceChildren();
    zonaTabla.replaceChildren(h('div', { class: 'vacio-estado' },
      h('p', {}, 'Escribe el monto y el número de cuotas para ver el cronograma.')));

    if (!datos.monto || !datos.numCuotas || !datos.fechaInicio) {
      resumenRapido.replaceChildren();
      avisoAutomatico.style.display = 'none';
      return;
    }

    try {
      // Con cuotas cobradas hay que preguntarle al préstamo, no al simulador
      const sim = esEdicion
        ? await api.simularEdicion(prestamo.id, datos)
        : await api.simularPrestamo(datos);
      if (sim.ok === false) {
        ultimoResultado = null;
        resumenRapido.replaceChildren();
        avisoAutomatico.style.display = 'none';
        zonaError.replaceChildren(h('div', { class: 'nota-info roja' }, sim.error));
        return;
      }
      ultimoResultado = sim;
      pintarVistaPrevia(sim);
    } catch (error) {
      ultimoResultado = null;
      resumenRapido.replaceChildren();
      avisoAutomatico.style.display = 'none';
      zonaTabla.replaceChildren();
      zonaError.replaceChildren(h('div', { class: 'nota-info roja' }, error.message));
    }
  }

  function pintarVistaPrevia(sim) {
    const { cronograma, desglose } = sim;
    // Cuando ya hay cobros, estas dos tarjetas cuentan otra historia
    const recalculando = sim.completo === false;

    // Explicación del interés automático
    if (sim.tasaManual) {
      avisoAutomatico.style.display = 'none';
      avisoManual.style.display = 'block';
      avisoManual.textContent = `Estás usando un interés MANUAL de ${cronograma.tasaPct.toFixed(2)}%. `
        + 'La app no lo calculó a partir de las semanas.';
    } else {
      avisoManual.style.display = 'none';
      avisoAutomatico.style.display = 'block';
      const parteDias = desglose?.diasRestantes
        ? ` + ${desglose.diasRestantes} día(s) (${desglose.porcentajeDiasRestantes.toFixed(2)}%)`
        : '';
      avisoAutomatico.textContent = `Interés automático: ${desglose?.semanasCompletas ?? 0} semana(s) `
        + `(${(desglose?.porcentajeSemanas ?? 0).toFixed(2)}%)${parteDias} `
        + `= ${cronograma.tasaPct.toFixed(2)}%`;
    }

    // Avisos propios del recálculo (lo cobrado no se toca, etc.)
    if (recalculando && sim.avisos?.length) {
      avisosEdicion.appendChild(h('ul', { style: 'margin:10px 0 0;padding-left:20px' },
        ...sim.avisos.map((texto) => h('li', { class: 'nota' }, texto))));
    }

    const rutaTexto = cronograma.pasoDias === 1 ? 'cada día' : 'cada 7 días';
    const pendientes = cronograma.cuotas.filter((c) => c.estado !== 'pagada');

    if (recalculando) {
      const primera = pendientes[0];
      resumenRapido.replaceChildren(
        h('div', { class: 'dato verde' },
          h('div', { class: 'titulo' }, 'Ya cobrado (no cambia)'),
          h('div', { class: 'monto' }, formatearSoles(cronograma.capitalPagado + cronograma.interesPagado)),
          h('div', { class: 'nota' }, `S/ ${cronograma.capitalPagado} de capital + S/ ${cronograma.interesPagado} de interés`)),
        h('div', { class: 'dato azul' },
          h('div', { class: 'titulo' }, 'Capital que falta recuperar'),
          h('div', { class: 'monto' }, formatearSoles(cronograma.capitalRestante)),
          h('div', { class: 'nota' }, `de S/ ${cronograma.monto} que ahora debe el cliente`)),
        h('div', { class: 'dato ambar' },
          h('div', { class: 'titulo' }, 'Interés que falta ganar'),
          h('div', { class: 'monto' }, formatearSoles(cronograma.interesPendiente)),
          h('div', { class: 'nota' }, `a ${cronograma.tasaPct.toFixed(2)}% sobre el monto nuevo`)),
        h('div', { class: 'dato verde' },
          h('div', { class: 'titulo' }, 'Nueva cuota a cobrar'),
          h('div', { class: 'monto' }, formatearSoles(cronograma.cuota)),
          h('div', { class: 'nota' }, `${pendientes.length} cuota(s) ${rutaTexto}`
            + (primera ? `, la ${primera.numero} el ${formatearFecha(primera.fecha)}` : ''))));
    } else {
      resumenRapido.replaceChildren(
        h('div', { class: 'dato verde' },
          h('div', { class: 'titulo' }, 'Monto prestado'),
          h('div', { class: 'monto' }, formatearSoles(cronograma.monto)),
          h('div', { class: 'nota' }, `a ${cronograma.tasaPct.toFixed(2)}% de interés`)),
        h('div', { class: 'dato ambar' },
          h('div', { class: 'titulo' }, 'Interés total (tu ganancia)'),
          h('div', { class: 'monto' }, formatearSoles(cronograma.interesTotal)),
          h('div', { class: 'nota' }, `${cronograma.diasTotales} días de préstamo`)),
        h('div', { class: 'dato azul' },
          h('div', { class: 'titulo' }, 'Total a pagar'),
          h('div', { class: 'monto' }, formatearSoles(cronograma.totalPagar)),
          h('div', { class: 'nota' }, `${cronograma.cuotas.length} cuota(s) ${rutaTexto}`)),
        h('div', { class: 'dato verde' },
          h('div', { class: 'titulo' }, 'Valor de cada cuota'),
          h('div', { class: 'monto' }, formatearSoles(cronograma.cuota)),
          h('div', { class: 'nota' }, `${formatearFecha(cronograma.cuotas[0].fecha)} la primera`)));
    }

    const tabla = h('table', { class: 'tabla' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Cuota'),
        h('th', {}, 'Fecha'),
        h('th', { class: 'num' }, 'Monto'),
        h('th', { class: 'num' }, 'Interés'),
        h('th', { class: 'num' }, 'Capital'),
        h('th', { class: 'num' }, 'Capital pendiente'))),
      h('tbody', {}, ...cronograma.cuotas.map((cuota) => {
        const cobrada = cuota.estado === 'pagada';
        return h('tr', { style: cobrada ? 'background:var(--verde-claro)' : '' },
          h('td', { class: 'negrita' }, `Cuota ${cuota.numero}`,
            cobrada ? h('span', { class: 'etiqueta verde', style: 'margin-left:6px' }, 'Cobrada') : null),
          h('td', { class: 'nowrap' },
            formatearFecha(cuota.fecha),
            cobrada && cuota.fechaPago
              ? h('div', { class: 'nota' }, `pagada el ${formatearFecha(cuota.fechaPago)}`) : null),
          h('td', { class: 'num negrita' }, formatearSoles(cuota.monto)),
          h('td', { class: 'num', style: 'color:var(--ambar)' }, formatearSoles(cuota.interes)),
          h('td', { class: 'num', style: 'color:var(--verde)' }, formatearSoles(cuota.capital)),
          h('td', { class: 'num' }, formatearSoles(capitalPendienteDe(cuota))));
      })));

    zonaTabla.replaceChildren(
      h('div', { style: 'padding:12px 18px 0' },
        h('p', { class: 'titulo-seccion', style: 'margin-bottom:8px' },
          recalculando
            ? 'Así quedaría el préstamo: las cuotas verdes ya las cobraste y no se mueven'
            : 'Cronograma: en cada cuota, esta parte es tu ganancia y esta parte recuperas tu dinero'),
        barraDesglose(cronograma.interesTotal, cronograma.monto)),
      tabla);
  }

  /** El capital que falta va bajando cuota a cuota, sin contar las ya cobradas. */
  function capitalPendienteDe(cuota) {
    if (ultimoResultado?.cronograma?.capitalRestante !== undefined
      && ultimoResultado.completo === false) {
      const c = ultimoResultado.cronograma;
      const indice = c.cuotas.findIndex((x) => x.numero === cuota.numero);
      const previo = c.cuotas
        .slice(0, indice + 1)
        .reduce((suma, x) => suma + (x.estado === 'pagada' ? 0 : Number(x.capital)), 0);
      return c.capitalRestante - previo;
    }
    return cuota.capitalPendiente;
  }

  /* ---------------- Botones ---------------- */

  const botonGuardar = h('button', { class: 'btn btn-primario', type: 'button' },
    esEdicion ? 'Guardar cambios' : 'Guardar préstamo');

  botonGuardar.addEventListener('click', async () => {
    const datos = leerDatos();
    zonaError.replaceChildren();

    if (!clienteElegido) {
      zonaError.replaceChildren(h('div', { class: 'nota-info roja' },
        'Elige un cliente (búscalo arriba o usa "+ Nuevo cliente").'));
      return;
    }
    if (!ultimoResultado || !ultimoResultado.cronograma?.cuotas?.length) {
      zonaError.replaceChildren(h('div', { class: 'nota-info roja' },
        ultimoResultado?.error || 'Completa el monto, las cuotas y la fecha para ver la vista previa.'));
      return;
    }

    botonGuardar.disabled = true;
    botonGuardar.textContent = 'Guardando…';
    try {
      let guardado;
      if (esEdicion) {
        guardado = await api.editarPrestamo(prestamo.id, datos);
      } else {
        guardado = await api.crearPrestamo({ ...datos, clienteId: clienteElegido });
      }
      ventana.cerrar();
      if (esEdicion) {
        const cobradas = guardado.resumen?.cuotasPagadas ?? 0;
        avisar(cobradas
          ? `Préstamo #${guardado.id} actualizado. Las ${cobradas} cuota(s) que ya habías cobrado quedaron intactas.`
          : `Préstamo #${guardado.id} actualizado.`, 'exito');
      } else {
        avisar(`¡Préstamo #${guardado.id} creado para ${guardado.cliente.nombre}!`, 'exito');
      }
      refrescar();
      alGuardar(guardado);
    } catch (error) {
      zonaError.replaceChildren(h('div', { class: 'nota-info roja' }, error.message));
      botonGuardar.disabled = false;
      botonGuardar.textContent = esEdicion ? 'Guardar cambios' : 'Guardar préstamo';
    }
  });

  /* ---------------- Armado de la ventana ---------------- */

  const usarManualCaja = h('div', {},
    h('label', { style: 'display:flex;gap:8px;align-items:center;font-weight:600;margin-bottom:6px;cursor:pointer' },
      usarManual, 'Usar otro interés (caso especial)'),
    h('div', { style: 'display:flex;gap:8px;align-items:center' },
      h('span', { style: 'color:var(--gris-500);font-weight:700' }, '%'),
      h('div', { style: 'flex:1' }, tasaManual),
      h('span', { class: 'etiqueta gris' }, `Automático: ${tasaSemana()}% / semana`)),
    h('div', { class: 'ayuda' },
      'Normalmente lo puedes dejar apagado: la app calcula el 5% por cada 7 días automáticamente.'));

  usarManual.addEventListener('change', () => {
    if (usarManual.checked && !tasaManual.value && ultimoResultado) {
      tasaManual.value = String(Number(ultimoResultado.cronograma.tasaPct.toFixed(2)));
    }
    refrescarVistaPrevia();
  });

  const contenido = h('div', {},
    h('div', { class: 'nota-info' },
      `Tu tabla de interés: ${tasaSemana()}% por cada 7 días. `
      + 'Puedes cambiarla en Ajustes si algún día la subes o la bajas.'),

    avisoCobros,

    selector.envoltura,

    h('div', { class: 'fila-campos' },
      h('div', { class: 'campo' },
        h('label', { for: 'monto' },
          esEdicion ? 'Monto del préstamo (S/)' : 'Monto a prestar (S/)',
          h('span', { class: 'obligatorio' }, ' *')),
        monto,
        h('div', { class: 'ayuda' }, conCobros
          ? 'El total que le entregaste al cliente, contando lo que ya te devolvió.'
          : 'Cuánto dinero le entregas al cliente hoy.')),
      h('div', { class: 'campo' },
        h('label', { for: 'frecuencia' }, 'Frecuencia de pago'),
        frecuencia),
      h('div', { class: 'campo' },
        h('label', { for: 'cuotas' }, 'Número de cuotas', h('span', { class: 'obligatorio' }, ' *')),
        numCuotas,
        h('div', { class: 'ayuda' }, conCobros
          ? `En total, contando las ${prestamo.resumen.cuotasPagadas} que ya cobraste.`
          : 'Cuántas veces te va a pagar.'))),

    h('div', { class: 'campo' },
      h('label', { for: 'fechaInicio' }, 'Fecha de la primera cuota'),
      fechaInicio,
      h('div', { class: 'ayuda' }, 'A partir de ese día se cuentan las cuotas.')),

    usarManualCaja,

    zonaError,
    avisoAutomatico,
    avisoManual,
    resumenRapido,
    avisosEdicion,
    zonaTabla,
    h('div', { style: 'margin-top:16px' },
      h('div', { class: 'titulo-seccion' }, 'Nota interna'),
      notas));

  // Recalcular la vista previa con cada tecla / cambio
  for (const control of [monto, frecuencia, numCuotas, fechaInicio, tasaManual]) {
    control.addEventListener('input', refrescarVistaPrevia);
    control.addEventListener('change', refrescarVistaPrevia);
  }

  const ventana = abrirModal({
    titulo: esEdicion ? `Editar préstamo #${prestamo.id}` : 'Nuevo préstamo',
    ancho: 'ancho',
    contenido,
    pie: [
      h('button', { class: 'btn btn-claro', type: 'button', onclick: () => ventana.cerrar() }, 'Cancelar'),
      botonGuardar,
    ],
  });

  refrescarVistaPrevia();
  return ventana;
}
