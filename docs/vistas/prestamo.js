/**
 * ============================================================================
 *  VISTA: DETALLE DE UN PRÉSTAMO
 * ============================================================================
 *  Muestra todos los datos del préstamo y, debajo, un botón por cada cuota.
 *  Al tocar un botón la cuota se marca como PAGADA y el botón cambia de color.
 *  Todo lo demás (calendario, listas, dashboard, capital) se actualiza al toque.
 * ============================================================================
 */

import { api } from '../api.js';
import { app, ir, refrescar, suscribir } from '../estado.js';
import {
  h, avisar, confirmar, abrirModal, formatearSoles, barraDesglose,
  barraProgreso, botonWhatsapp, mensajeRecordatorio, iniciales, icono,
} from '../ui.js';
import {
  formatearFecha, hoyISO, NOMBRE_FRECUENCIA, desglosarTasa,
} from '../compartido/calculo.js';

export async function montarPrestamo(contenedor, { id }) {
  if (!id) { ir('prestamos'); return; }
  const prestamo = await api.prestamo(id);
  await pintar(contenedor, prestamo);
  suscribir(() => { pintar(contenedor, api.prestamo(id)).catch(console.error); });
}

/* ========================================================================== *
 *  PINTADO
 * ========================================================================== */

async function pintar(contenedor, prestamo) {
  const r = prestamo.resumen;
  const cliente = prestamo.cliente;
  const hoy = hoyISO();
  const frecuencia = NOMBRE_FRECUENCIA[prestamo.frecuencia] || prestamo.frecuencia;

  /* ---------------- Encabezado ---------------- */

  const acciones = h('div', { class: 'acciones' },
    h('button', { class: 'btn btn-claro', type: 'button', onclick: () => ir('prestamos') },
      h('span', { class: 'con-icono' }, icono('flecha'), 'Volver')),

    h('button', {
      class: 'btn btn-claro', type: 'button',
      onclick: () => ir(`clientes/${prestamo.cliente_id}`),
    }, 'Ver historial del cliente'),

    h('button', {
      class: 'btn btn-claro', type: 'button',
      onclick: async () => {
        const { abrirFormularioPrestamo } = await import('../modales/prestamo-form.js');
        abrirFormularioPrestamo({ prestamo, alGuardar: (nuevo) => pintar(contenedor, nuevo) });
      },
    }, 'Editar'),

    botonWhatsapp(cliente.telefono, (() => {
      const siguiente = prestamo.cuotas.find((c) => c.estado !== 'pagada');
      return siguiente
        ? mensajeRecordatorio({
          nombreNegocio: app.ajustes.nombreNegocio,
          cliente: cliente.nombre,
          numeroCuota: siguiente.numero,
          cuotasTotal: r.cuotasTotal,
          fecha: formatearFecha(siguiente.fecha),
          monto: siguiente.a_cobrar || siguiente.monto,
          interes: siguiente.interes,
          capital: siguiente.capital,
          saldo: r.pendiente,
        })
        : `Hola ${cliente.nombre}, te informamos que tu préstamo está pagado por completo. ¡Gracias!`;
    })(), 'Recordar cobro', false),

    h('span', { class: 'crece', style: 'flex:1' }),

    r.cuotasPagadas === 0
      ? h('button', {
        class: 'btn btn-peligro', type: 'button',
        onclick: async () => {
          const ok = await confirmar('Borrar préstamo',
            `¿Borrar el préstamo #${prestamo.id} de ${cliente.nombre} por ${formatearSoles(prestamo.monto)}? `
            + 'Se perderá el cronograma.', 'Sí, borrar');
          if (!ok) return;
          try {
            await api.borrarPrestamo(prestamo.id);
            avisar('Préstamo borrado.', 'exito');
            ir('prestamos');
            refrescar();
          } catch (error) { avisar(error.message, 'error'); }
        },
      }, 'Borrar')
      : null);

  /* ---------------- Ficha de datos ---------------- */

  const desglose = desglosarTasa(prestamo.dias_totales, Number(app.ajustes.tasaSemana) || 5);

  const ficha = h('div', { class: 'tarjeta' },
    h('div', { class: 'tarjeta-cabecera' },
      h('div', { class: 'avatar' }, iniciales(cliente.nombre)),
      h('div', {},
        h('h2', {}, cliente.nombre),
        h('div', { class: 'sub' },
          `Préstamo #${prestamo.id} · desde ${formatearFecha(prestamo.fecha_inicio)}`)),
      h('span', { class: 'crece' }),
      h('span', { class: `etiqueta ${prestamo.estado === 'activo' ? 'verde' : prestamo.estado === 'terminado' ? 'azul' : 'gris'}` },
        prestamo.estado === 'activo' ? 'Activo' : prestamo.estado === 'terminado' ? 'Terminado' : 'Cerrado por refinanciamiento')),

    h('div', { class: 'tarjeta-cuerpo' },
      h('div', { class: 'lista-datos' },
        h('div', { class: 'dato-caja' }, h('div', { class: 'et' }, 'Monto prestado'),
          h('div', { class: 'vl' }, formatearSoles(prestamo.monto))),
        h('div', { class: 'dato-caja' }, h('div', { class: 'et' }, 'Interés aplicado'),
          h('div', { class: 'vl' }, `${Number(prestamo.tasa_pct).toFixed(2)}%`),
          h('div', { class: 'ayuda' },
            prestamo.tasa_origen === 'manual' ? 'Manual'
              : `${desglose.semanasCompletas} sem. (${desglose.porcentajeSemanas.toFixed(2)}%)`
                + (desglose.diasRestantes ? ` + ${desglose.diasRestantes} día(s) (${desglose.porcentajeDiasRestantes.toFixed(2)}%)` : ''))),
        h('div', { class: 'dato-caja' }, h('div', { class: 'et' }, 'Frecuencia'),
          h('div', { class: 'vl chico' }, frecuencia),
          h('div', { class: 'ayuda' }, `${prestamo.num_cuotas} cuota(s)`)),
        h('div', { class: 'dato-caja interes' }, h('div', { class: 'et' }, 'Interés total'),
          h('div', { class: 'vl' }, formatearSoles(prestamo.interes_total)),
          h('div', { class: 'ayuda' }, 'Tu ganancia')),
        h('div', { class: 'dato-caja' }, h('div', { class: 'et' }, 'Total a pagar'),
          h('div', { class: 'vl' }, formatearSoles(prestamo.total_pagar))),
        h('div', { class: 'dato-caja capital' }, h('div', { class: 'et' }, 'Valor de cada cuota'),
          h('div', { class: 'vl' }, formatearSoles(prestamo.cuota)))),

      h('hr', { class: 'separador' }),
      barraDesglose(prestamo.interes_total, prestamo.monto),

      prestamo.tiene_refinanciamiento
        ? h('div', { class: 'nota-info ambar', style: 'margin-top:14px' },
          'Este préstamo fue refinanciado. El saldo se pasó a un préstamo nuevo.')
        : null,

      prestamo.refinanciado_de
        ? h('div', { class: 'nota-info', style: 'margin-top:14px' },
          `Nació del refinanciamiento del préstamo #${prestamo.refinanciado_de}.`)
        : null,

      prestamo.notas
        ? h('div', { style: 'margin-top:14px;font-size:14px;color:var(--gris-700)' },
          h('span', { class: 'titulo-seccion' }, 'Nota'), prestamo.notas)
        : null));

  /* ---------------- Progreso y saldos ---------------- */

  const progreso = h('div', { class: 'tarjeta' },
    h('div', { class: 'tarjeta-cabecera' },
      h('h2', {}, '¿Cuánto te ha pagado?'),
      h('span', { class: 'crece' }),
      r.terminado ? h('span', { class: 'etiqueta verde' }, '¡Préstamo terminado!')
        : h('span', { class: 'etiqueta azul' }, `${r.cuotasPagadas} de ${r.cuotasTotal} cuotas pagadas`)),

    h('div', { class: 'tarjeta-cuerpo' },
      barraProgreso(`${r.cuotasPagadas} de ${r.cuotasTotal} cuotas`, r.progreso,
        r.terminado ? 'var(--verde)' : 'var(--verde-claro)'),

      h('div', { class: 'lista-datos', style: 'margin-top:16px' },
        h('div', { class: 'dato-caja capital' },
          h('div', { class: 'et' }, 'Capital recuperado'),
          h('div', { class: 'vl' }, formatearSoles(r.capitalRecuperado)),
          h('div', { class: 'ayuda' }, `${r.cuotasPagadas} cuota(s) pagadas`)),
        h('div', { class: 'dato-caja capital' },
          h('div', { class: 'et' }, 'Capital pendiente'),
          h('div', { class: 'vl' }, formatearSoles(r.capitalPendiente)),
          h('div', { class: 'ayuda' }, `${r.cuotasPendientes} cuota(s) por pagar`)),
        h('div', { class: 'dato-caja interes' },
          h('div', { class: 'et' }, 'Interés cobrado'),
          h('div', { class: 'vl' }, formatearSoles(r.interesCobrado))),
        h('div', { class: 'dato-caja interes' },
          h('div', { class: 'et' }, 'Interés por cobrar'),
          h('div', { class: 'vl' }, formatearSoles(r.interesPorCobrar))),
        h('div', { class: `dato-caja ${r.cuotasVencidas ? 'rojo' : ''}` },
          h('div', { class: 'et' }, 'Saldo que falta'),
          h('div', { class: 'vl' }, formatearSoles(r.pendiente)),
          h('div', { class: 'ayuda' },
            r.cuotasVencidas ? `${r.cuotasVencidas} cuota(s) vencida(s)` : 'Sin atrasos')),
        r.saldoFavor > 0
          ? h('div', { class: 'dato-caja' },
            h('div', { class: 'et' }, 'Saldo a favor del cliente'),
            h('div', { class: 'vl' }, formatearSoles(r.saldoFavor)),
            h('div', { class: 'ayuda' }, 'Pagó de más'))
          : null),

      h('div', { style: 'margin-top:16px;display:flex;gap:10px;flex-wrap:wrap' },
        h('button', {
          class: 'btn btn-claro', type: 'button',
          onclick: () => abrirAbonos(contenedor, prestamo),
        }, '+ Registrar abono / adelanto'),
        !r.terminado
          ? h('button', {
            class: 'btn btn-secundario', type: 'button',
            onclick: () => abrirRefinanciamiento(contenedor, prestamo),
          }, 'Refinanciar / renovar')
          : null)));

  /* ---------------- Cuotas ---------------- */

  const botones = prestamo.cuotas.map((cuota) => botonCuota(prestamo, cuota, hoy, contenedor));
  const pendientes = prestamo.cuotas.filter((c) => c.estado !== 'pagada');

  const cuotas = h('div', { class: 'tarjeta' },
    h('div', { class: 'tarjeta-cabecera' },
      h('h2', {}, 'Cuotas'),
      h('span', { class: 'crece' }),
      pendientes.length
        ? h('span', { class: 'etiqueta ambar' }, `Falta cobrar ${formatearSoles(r.pendiente)}`)
        : h('span', { class: 'etiqueta verde' }, 'Todo cobrado')),
    h('div', { class: 'tarjeta-cuerpo' },
      h('p', { class: 'nota-info', style: 'margin-bottom:14px' },
        'Toca el botón de la cuota para marcarla como PAGADA. Si te equivocaste, tócala otra vez para deshacer.'),
      h('div', { class: 'cuotas' }, ...botones)));

  /* ---------------- Tabla de detalle ---------------- */

  const tablaDetalle = h('div', { class: 'tarjeta' },
    h('div', { class: 'tarjeta-cabecera' }, h('h2', {}, 'Cronograma completo')),
    h('div', { class: 'tabla-envoltura' },
      h('table', { class: 'tabla plegable' },
        h('thead', {}, h('tr', {},
          h('th', {}, 'Cuota'),
          h('th', {}, 'Fecha'),
          h('th', { class: 'num' }, 'Monto'),
          h('th', { class: 'num' }, 'Interés'),
          h('th', { class: 'num' }, 'Capital'),
          h('th', { class: 'num' }, 'Estado'))),
        h('tbody', {}, ...prestamo.cuotas.map((cuota) => {
          const atraso = Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${cuota.fecha}T00:00:00Z`)) / 86400000);
          const estadoTexto = cuota.estado === 'pagada'
            ? `Pagada el ${formatearFecha(cuota.fecha_pago)}`
            : cuota.a_cobrar < cuota.monto
              ? `Falta ${formatearSoles(cuota.a_cobrar)}`
              : atraso > 0 ? `${atraso} día(s) de atraso` : 'Pendiente';

          return h('tr', {},
            h('td', { class: 'bloque', 'data-etiqueta': 'Cuota' }, `Cuota ${cuota.numero}`),
            h('td', { datosEtiqueta: 'Fecha' }, formatearFecha(cuota.fecha)),
            h('td', { datosEtiqueta: 'Monto', class: 'num negrita' }, formatearSoles(cuota.monto)),
            h('td', { datosEtiqueta: 'Interés', class: 'num', style: 'color:var(--ambar)' }, formatearSoles(cuota.interes)),
            h('td', { datosEtiqueta: 'Capital', class: 'num', style: 'color:var(--verde)' }, formatearSoles(cuota.capital)),
            h('td', { datosEtiqueta: 'Estado' },
              h('span', {
                class: `etiqueta ${cuota.estado === 'pagada' ? 'verde' : atraso > 0 && cuota.estado !== 'pagada' ? 'roja' : 'gris'}`,
              }, estadoTexto),
              cuota.abono_aplicado > 0
                ? h('div', { style: 'font-size:11.5px;color:var(--azul);margin-top:3px' },
                  `Abono aplicado: ${formatearSoles(cuota.abono_aplicado)}`)
                : null));
        })))));

  /* ---------------- Abonos ---------------- */

  const zonaAbonos = prestamo.abonos.length
    ? h('div', { class: 'tarjeta' },
      h('div', { class: 'tarjeta-cabecera' },
        h('h2', {}, 'Abonos y adelantos'),
        h('span', { class: 'crece' }),
        h('span', { class: 'etiqueta azul' }, `Total ${formatearSoles(r.totalAbonos)}`)),
      h('div', { class: 'tabla-envoltura' },
        h('table', { class: 'tabla plegable' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Fecha'),
            h('th', { class: 'num' }, 'Monto'),
            h('th', {}, 'Desde la cuota'),
            h('th', {}, 'Nota'),
            h('th', {}))),
          h('tbody', {}, ...prestamo.abonos.map((abono) => h('tr', {},
            h('td', { datosEtiqueta: 'Fecha' }, formatearFecha(abono.fecha)),
            h('td', { datosEtiqueta: 'Monto', class: 'num negrita' }, formatearSoles(abono.monto)),
            h('td', { datosEtiqueta: 'Desde' }, `Cuota ${abono.cuota_inicio}`),
            h('td', { datosEtiqueta: 'Nota' }, abono.nota || '—'),
            h('td', {},
              h('button', {
                class: 'btn btn-peligro btn-pequeno', type: 'button',
                onclick: async () => {
                  const ok = await confirmar('Borrar abono',
                    `¿Borrar el abono de ${formatearSoles(abono.monto)} del ${formatearFecha(abono.fecha)}? `
                    + 'Las cuotas volverán a quedar pendientes.', 'Sí, borrar');
                  if (!ok) return;
                  try {
                    const actualizado = await api.borrarAbono(prestamo.id, abono.id);
                    avisar('Abono borrado.', 'exito');
                    await pintar(contenedor, actualizado);
                    refrescar();
                  } catch (error) { avisar(error.message, 'error'); }
                },
              }, 'Borrar'))))))))
    : null;

  contenedor.replaceChildren(
    acciones, ficha, progreso, cuotas, tablaDetalle, zonaAbonos,
    h('div', { style: 'height:30px' }),
  );
}

/* ========================================================================== *
 *  Botón de una cuota
 * ========================================================================== */

function botonCuota(prestamo, cuota, hoy, contenedor) {
  const pagada = cuota.estado === 'pagada';
  const atraso = Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${cuota.fecha}T00:00:00Z`)) / 86400000);
  const esHoy = cuota.fecha === hoy;
  const vencida = !pagada && atraso > 0;

  const clases = ['cuota-btn'];
  if (pagada) clases.push('pagada');
  else if (vencida) clases.push('vencida');
  else if (esHoy) clases.push('hoy');
  else if (cuota.cubierta_por_abono) clases.push('cubierta');

  const montoMostrado = pagada ? cuota.monto : (cuota.a_cobrar || cuota.monto);

  const boton = h('button', {
    class: clases.join(' '),
    type: 'button',
    title: pagada
      ? `Pagada el ${formatearFecha(cuota.fecha_pago)}. Toca para deshacer.`
      : 'Toca para marcar como pagada',
  },
  h('div', { class: 'num' }, `Cuota ${cuota.numero}`),
  h('div', { class: 'monto' }, formatearSoles(montoMostrado)),
  h('div', { class: 'fecha' }, formatearFecha(cuota.fecha)),
  h('span', { class: 'marca', style: colorMarca(pagada, vencida, esHoy, cuota) },
pagada ? `Pagada ${formatearFecha(cuota.fecha_pago)}`
      : vencida ? `${atraso} día(s) de atraso`
      : esHoy ? 'Vence hoy' : 'Pendiente'));

  boton.addEventListener('click', async () => {
    if (pagada) {
      const ok = await confirmar('Deshacer pago',
        `¿Deshacer el pago de la cuota ${cuota.numero} (${formatearSoles(cuota.monto)})? `
        + 'Volverá a quedar pendiente.', 'Sí, deshacer');
      if (!ok) return;
      try {
        await api.deshacerCuota(prestamo.id, cuota.numero);
        avisar(`Cuota ${cuota.numero} vuelve a pendiente.`, 'info');
        refrescar();
      } catch (error) { avisar(error.message, 'error'); }
      return;
    }

    try {
      await api.pagarCuota(prestamo.id, cuota.numero);
      avisar(`Cuota ${cuota.numero} de ${formatearSoles(cuota.monto)} cobrada.`, 'exito');
      refrescar();
    } catch (error) {
      avisar(error.message, 'error');
    }
  });

  return boton;
}

function colorMarca(pagada, vencida, esHoy, cuota) {
  if (pagada) return 'color:#15803d';
  if (vencida) return 'color:var(--rojo)';
  if (esHoy) return 'color:var(--ambar)';
  if (cuota.cubierta_por_abono) return 'color:var(--azul)';
  return 'color:var(--gris-500)';
}

/* ========================================================================== *
 *  Ventana de abonos / adelantos
 * ========================================================================== */

export function abrirAbonos(contenedor, prestamo) {
  const pendientes = prestamo.cuotas.filter((c) => c.estado !== 'pagada');
  const primeraPendiente = pendientes[0]?.numero || 1;

  const monto = h('input', { type: 'text', inputmode: 'decimal', class: 'monto', placeholder: '0.00' });
  const fecha = h('input', { type: 'date', value: hoyISO() });
  const cuotaInicio = h('select', {},
    ...pendientes.map((c) => h('option', {
      value: String(c.numero),
      selected: c.numero === primeraPendiente,
    }, `Cuota ${c.numero} — ${formatearFecha(c.fecha)} (${formatearSoles(c.a_cobrar || c.monto)})`)));
  const nota = h('input', { type: 'text', placeholder: 'Nota opcional' });
  const zonaError = h('div', {});

  const boton = h('button', { class: 'btn btn-primario', type: 'button' }, 'Registrar abono');

  boton.addEventListener('click', async () => {
    boton.disabled = true;
    zonaError.replaceChildren();
    try {
      const resultado = await api.crearAbono(prestamo.id, {
        monto: monto.value,
        fecha: fecha.value,
        cuotaInicio: Number(cuotaInicio.value),
        nota: nota.value.trim(),
      });
      ventana.cerrar();
      const extra = resultado.cubiertas.length
        ? ` Se pagaron ${resultado.cubiertas.length} cuota(s) completa(s) con este abono.`
        : '';
      avisar(`Abono de ${formatearSoles(monto.value)} registrado.${extra}`, 'exito');
      refrescar();
      await pintar(contenedor, resultado.prestamo);
    } catch (error) {
      zonaError.replaceChildren(h('div', { class: 'nota-info roja' }, error.message));
      boton.disabled = false;
    }
  });

  const ventana = abrirModal({
    titulo: 'Registrar abono / adelanto',
    contenido: h('div', {},
      h('div', { class: 'nota-info' },
        'El abono es dinero EXTRA que el cliente paga por adelantado. No cambia el monto de la cuota: '
        + 'simplemente se descuenta de lo que falta cobrar, empezando por la cuota que elijas.'),
      h('div', { class: 'campo' },
        h('label', {}, 'Monto del abono (S/)', h('span', { class: 'obligatorio' }, ' *')), monto),
      h('div', { class: 'fila-campos' },
        h('div', { class: 'campo' }, h('label', {}, 'Fecha del pago'), fecha),
        h('div', { class: 'campo' },
          h('label', {}, 'Se aplica desde'), cuotaInicio,
          h('div', { class: 'ayuda' }, 'A partir de esta cuota se descuenta el abono.'))),
      h('div', { class: 'campo' }, h('label', {}, 'Nota'), nota),
      zonaError),
    pie: [
      h('button', { class: 'btn btn-claro', type: 'button', onclick: () => ventana.cerrar() }, 'Cancelar'),
      boton,
    ],
  });
}

/* ========================================================================== *
 *  Refinanciamiento
 * ========================================================================== */

function abrirRefinanciamiento(contenedor, prestamo) {
  const r = prestamo.resumen;

  const monto = h('input', {
    type: 'text', inputmode: 'decimal', class: 'monto',
    value: r.capitalPendiente > 0 ? r.capitalPendiente.toFixed(2) : prestamo.monto.toFixed(2),
  });
  const numCuotas = h('input', { type: 'number', min: '1', max: '520', value: '4', class: 'mono-num' });
  const frecuencia = h('select', {},
    h('option', { value: 'semanal', selected: prestamo.frecuencia === 'semanal' }, 'Semanal (cada 7 días)'),
    h('option', { value: 'diaria', selected: prestamo.frecuencia === 'diaria' }, 'Diaria (cada día)'));
  const fechaInicio = h('input', { type: 'date', value: hoyISO() });
  const nota = h('input', { type: 'text', placeholder: 'Motivo de la renovación' });
  const zonaError = h('div', {});
  const zonaResumen = h('div', { style: 'margin-top:14px' });

  const boton = h('button', { class: 'btn btn-secundario', type: 'button' }, 'Refinanciar');

  async function previsualizar() {
    try {
      const sim = await api.simularPrestamo({
        monto: monto.value, numCuotas: numCuotas.value,
        frecuencia: frecuencia.value, fechaInicio: fechaInicio.value,
      });
      zonaResumen.replaceChildren(h('div', { class: 'nota-info verde' },
        `Nuevo préstamo: ${formatearSoles(sim.cronograma.monto)} por `
        + `${sim.cronograma.cuotas.length} cuotas de ${formatearSoles(sim.cronograma.cuota)} `
        + `(interés ${sim.cronograma.tasaPct.toFixed(2)}% = ${formatearSoles(sim.cronograma.interesTotal)}).`));
    } catch (error) {
      zonaResumen.replaceChildren(h('div', { class: 'nota-info roja' }, error.message));
    }
  }

  boton.addEventListener('click', async () => {
    const ok = await confirmar('Refinanciar préstamo',
      `Se cerrará el préstamo #${prestamo.id} y se abrirá uno nuevo por `
      + `${formatearSoles(monto.value)} con ${numCuotas.value} cuotas. `
      + 'Lo ya cobrado queda registrado en el historial. ¿Continuar?', 'Sí, refinanciar');
    if (!ok) return;
    boton.disabled = true;
    zonaError.replaceChildren();
    try {
      const resultado = await api.refinanciar(prestamo.id, {
        monto: monto.value,
        numCuotas: Number(numCuotas.value),
        frecuencia: frecuencia.value,
        fechaInicio: fechaInicio.value,
        nota: nota.value.trim(),
      });
      ventana.cerrar();
      avisar(`Refinanciado. Nuevo préstamo #${resultado.nuevo.id}.`, 'exito');
      ir(`prestamos/${resultado.nuevo.id}`);
      refrescar();
    } catch (error) {
      zonaError.replaceChildren(h('div', { class: 'nota-info roja' }, error.message));
      boton.disabled = false;
    }
  });

  for (const control of [monto, numCuotas, frecuencia, fechaInicio]) {
    control.addEventListener('input', previsualizar);
    control.addEventListener('change', previsualizar);
  }

  const ventana = abrirModal({
    titulo: 'Refinanciar / renovar',
    ancho: 'ancho',
    contenido: h('div', {},
      h('div', { class: 'nota-info ambar' },
        'Refinanciar es extender el plazo: el capital que falta te lo pagan en un préstamo nuevo '
        + 'con su propio interés. El préstamo actual se marca como cerrado y queda en el historial.'),
      h('div', { class: 'lista-datos', style: 'margin-bottom:16px' },
        h('div', { class: 'dato-caja' }, h('div', { class: 'et' }, 'Capital pendiente'),
          h('div', { class: 'vl' }, formatearSoles(r.capitalPendiente))),
        h('div', { class: 'dato-caja' }, h('div', { class: 'et' }, 'Interés por cobrar'),
          h('div', { class: 'vl' }, formatearSoles(r.interesPorCobrar))),
        h('div', { class: 'dato-caja' }, h('div', { class: 'et' }, 'Cuotas pagadas'),
          h('div', { class: 'vl' }, `${r.cuotasPagadas}/${r.cuotasTotal}`))),
      h('div', { class: 'fila-campos' },
        h('div', { class: 'campo' },
          h('label', {}, 'Monto del préstamo nuevo (S/)', h('span', { class: 'obligatorio' }, ' *')),
          monto,
          h('div', { class: 'ayuda' }, 'Por defecto, el capital que aún te debe.')),
        h('div', { class: 'campo' }, h('label', {}, 'Número de cuotas'), numCuotas),
        h('div', { class: 'campo' }, h('label', {}, 'Frecuencia'), frecuencia),
        h('div', { class: 'campo' }, h('label', {}, 'Inicio del nuevo préstamo'), fechaInicio)),
      h('div', { class: 'campo' }, h('label', {}, 'Motivo'), nota),
      zonaResumen,
      zonaError),
    pie: [
      h('button', { class: 'btn btn-claro', type: 'button', onclick: () => ventana.cerrar() }, 'Cancelar'),
      boton,
    ],
  });

  previsualizar();
}
