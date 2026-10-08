/**
 * ============================================================================
 *  VISTA: CAPITAL
 * ============================================================================
 *  Capital inicial (opcional) + resumen de:
 *    capital total, prestado, recuperado, disponible para prestar,
 *    interés ganado, interés por cobrar
 *  y el desglose por cliente con SOLO el capital pendiente.
 * ============================================================================
 */

import { api } from '/api.js';
import { refrescar, suscribir } from '/estado.js';
import {
  h, vacio, avisar, confirmar, abrirModal, iniciales, formatearSoles, barraDesglose,
} from '/ui.js';
import { formatearFecha } from '/compartido/calculo.js';

export async function montarCapital(contenedor) {
  await pintar(contenedor);
  suscribir(() => { pintar(contenedor).catch(console.error); });
}

async function pintar(contenedor) {
  const d = await api.capital();

  /* ---------------- Acciones ---------------- */

  const acciones = h('div', { class: 'acciones' },
    h('button', {
      class: 'btn btn-primario', type: 'button',
      onclick: () => abrirFormularioCapital(contenedor),
    }, d.movimientos.length ? '+ Agregar más capital' : '+ Registrar capital inicial'));

  /* ---------------- Aviso si no se ha registrado capital ---------------- */

  const avisoSinCapital = d.movimientos.length === 0
    ? h('div', { class: 'nota-info' },
      'Todavía no has registrado tu capital. Puedes empezar a usarlo ahora mismo: la app funciona igual '
      + 'sin esto, solo te sirve para saber cuánto dinero tienes disponible para prestar.')
    : null;

  /* ---------------- Resumen ---------------- */

  const resumen = h('div', { class: 'tarjeta' },
    h('div', { class: 'tarjeta-cabecera' },
      h('h2', {}, 'Resumen de tu capital'),
      h('span', { class: 'crece' }),
      h('span', { class: 'etiqueta azul' }, `hoy: ${formatearFecha(new Date().toISOString().slice(0, 10))}`)),
    h('div', { class: 'tarjeta-cuerpo' },
      h('div', { class: 'rejilla k4' },
        h('div', { class: 'dato azul' },
          h('div', { class: 'titulo' }, 'Capital total'),
          h('div', { class: 'monto' }, formatearSoles(d.capitalTotal)),
          h('div', { class: 'nota' }, 'Todo el dinero que tienes para prestar')),

        h('div', { class: 'dato ambar' },
          h('div', { class: 'titulo' }, 'Capital prestado ahora'),
          h('div', { class: 'monto' }, formatearSoles(d.capitalPrestado)),
          h('div', { class: 'nota' }, 'El que está en la calle, no cobrado')),

        h('div', { class: 'dato verde' },
          h('div', { class: 'titulo' }, 'Capital recuperado'),
          h('div', { class: 'monto' }, formatearSoles(d.capitalRecuperado)),
          h('div', { class: 'nota' }, 'Volvió a tu bolsillo')),

        h('div', { class: 'dato verde' },
          h('div', { class: 'titulo' }, 'Disponible para prestar'),
          h('div', { class: 'monto' }, formatearSoles(d.capitalDisponible)),
          h('div', { class: 'nota' }, 'Total − prestado ahora')),

        h('div', { class: 'dato ambar' },
          h('div', { class: 'titulo' }, 'Interés ganado (cobrado)'),
          h('div', { class: 'monto' }, formatearSoles(d.interesGanado)),
          h('div', { class: 'nota' }, 'Tu ganancia real')),

        h('div', { class: 'dato' },
          h('div', { class: 'titulo' }, 'Interés por cobrar'),
          h('div', { class: 'monto' }, formatearSoles(d.interesPorCobrar)),
          h('div', { class: 'nota' }, 'Ganancia futura de loans activos')),

        h('div', { class: 'dato azul' },
          h('div', { class: 'titulo' }, 'Total por cobrar'),
          h('div', { class: 'monto' }, formatearSoles(d.porCobrarTotal)),
          h('div', { class: 'nota' }, 'Capital + interés')),

        h('div', { class: 'dato' },
          h('div', { class: 'titulo' }, 'Clientes con deuda'),
          h('div', { class: 'monto' }, String(d.porCliente.length)))),

      h('div', { class: 'nota-info verde', style: 'margin-top:18px' },
        `Cómo se calcula el disponible: ${formatearSoles(d.capitalTotal)} (tu capital total) `
        + `− ${formatearSoles(d.capitalPrestado)} (lo que está prestado ahora) `
        + `= ${formatearSoles(d.capitalDisponible)}`)));

  /* ---------------- Movimientos de capital ---------------- */

  const movimientos = d.movimientos.length
    ? h('div', { class: 'tarjeta' },
      h('div', { class: 'tarjeta-cabecera' },
        h('h2', {}, 'Registro de capital'),
        h('span', { class: 'crece' }),
        h('span', { class: 'etiqueta azul' }, `${d.movimientos.length} movimiento(s)`)),
      h('div', { class: 'tabla-envoltura' },
        h('table', { class: 'tabla plegable' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Fecha'),
            h('th', {}, 'Tipo'),
            h('th', { class: 'num' }, 'Monto'),
            h('th', {}, 'Nota'),
            h('th', {}))),
          h('tbody', {}, ...d.movimientos.map((m) => h('tr', {},
            h('td', { datosEtiqueta: 'Fecha' }, formatearFecha(m.fecha)),
            h('td', { datosEtiqueta: 'Tipo' },
              h('span', { class: `etiqueta ${m.tipo === 'inicial' ? 'azul' : 'verde'}` },
                m.tipo === 'inicial' ? 'Capital inicial' : 'Capital agregado')),
            h('td', { datosEtiqueta: 'Monto', class: 'num negrita' }, formatearSoles(m.monto)),
            h('td', { datosEtiqueta: 'Nota' }, m.nota || '—'),
            h('td', {},
              h('button', {
                class: 'btn btn-peligro btn-pequeno', type: 'button',
                onclick: async () => {
                  const ok = await confirmar('Borrar movimiento',
                    `¿Borrar el movimiento de ${formatearSoles(m.monto)} del ${formatearFecha(m.fecha)}?`,
                    'Sí, borrar');
                  if (!ok) return;
                  try {
                    await api.borrarCapital(m.id);
                    avisar('Movimiento borrado.', 'exito');
                    refrescar();
                  } catch (error) { avisar(error.message, 'error'); }
                },
              }, 'Borrar'))))))))
    : null;

  /* ---------------- Desglose por cliente ---------------- */

  const porCliente = d.porCliente.length
    ? h('div', { class: 'tarjeta' },
      h('div', { class: 'tarjeta-cabecera' },
        h('h2', {}, 'Capital pendiente por cliente'),
        h('span', { class: 'crece' }),
        h('span', { class: 'etiqueta verde' },
          `Total pendiente: ${formatearSoles(d.porCliente.reduce((s, c) => s + c.capitalPendiente, 0))}`)),
      h('div', { class: 'tarjeta-cuerpo' },
        h('p', { class: 'nota-info', style: 'margin-bottom:14px' },
          'Aquí solo se cuenta el CAPITAL que te deben, sin mezclarlo con el interés. '
          + 'Si un cliente de S/ 200 en 4 cuotas ya pagó 1, aquí verás S/ 150.00 pendientes (3 cuotas).')),
      h('div', { class: 'tabla-envoltura' },
        h('table', { class: 'tabla plegable' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Cliente'),
            h('th', { class: 'num' }, 'Prestado'),
            h('th', { class: 'num' }, 'Recuperado'),
            h('th', { class: 'num' }, 'Capital pendiente'),
            h('th', { class: 'num' }, 'Total por cobrar'),
            h('th', {}, ''))),
          h('tbody', {}, ...d.porCliente.map((c) => h('tr', {},
            h('td', { class: 'bloque' },
              h('div', { class: 'celda-cliente' },
                h('div', { class: 'avatar' }, iniciales(c.cliente)),
                h('div', {},
                  h('strong', {}, c.cliente),
                  h('small', {}, `${c.prestamos} préstamo(s) activo(s)`)))),
            h('td', { datosEtiqueta: 'Prestado', class: 'num' }, formatearSoles(c.prestado)),
            h('td', { datosEtiqueta: 'Recuperado', class: 'num', style: 'color:var(--verde)' },
              formatearSoles(c.capitalRecuperado)),
            h('td', { datosEtiqueta: 'Capital pendiente', class: 'num negrita', style: 'color:var(--verde)' },
              formatearSoles(c.capitalPendiente)),
            h('td', { datosEtiqueta: 'Total por cobrar', class: 'num' }, formatearSoles(c.porCobrar)),
            h('td', {},
              h('div', { style: 'display:flex;gap:6px;justify-content:flex-end' },
                c.cuotasVencidas
                  ? h('span', { class: 'etiqueta roja' }, `${c.cuotasVencidas} vencida(s)`)
                  : null,
                h('button', {
                  class: 'btn btn-claro btn-pequeno', type: 'button',
                  onclick: () => { location.hash = `#/clientes/${c.clienteId}`; },
                }, 'Abrir')))))),
          h('tfoot', {}, h('tr', {},
            h('td', { class: 'negrita' }, 'TOTAL'),
            h('td', { class: 'num negrita' }, formatearSoles(d.capitalPrestado)),
            h('td', { class: 'num negrita' }, formatearSoles(d.capitalRecuperado)),
            h('td', { class: 'num negrita' }, formatearSoles(d.porCliente.reduce((s, c) => s + c.capitalPendiente, 0))),
            h('td', { class: 'num negrita' }, formatearSoles(d.porCobrarTotal)),
            h('td', {}))))))
    : h('div', { class: 'tarjeta' }, h('div', { class: 'tarjeta-cuerpo' }, vacio(
      'Nadie te debe capital ahora',
      'Cuando registres préstamos activos, aquí verás cuánto capital le queda a cada cliente.',
    )));

  /* ---------------- Ejemplo explicativo ---------------- */

  const ejemplo = d.ejemplos.demo.length
    ? h('div', { class: 'tarjeta' },
      h('div', { class: 'tarjeta-cabecera' }, h('h2', {}, 'Ejemplo con tus datos')),
      h('div', { class: 'tarjeta-cuerpo' },
        h('p', { style: 'margin-top:0;font-size:14px;color:var(--gris-700)' },
          `A ${d.ejemplos.demo[0].cliente} le prestaste ${formatearSoles(d.ejemplos.demo[0].prestado)} `
          + `en ${d.ejemplos.demo[0].cuotasTotal} cuotas. Ya pagó ${d.ejemplos.demo[0].cuotasPagadas}, `
          + `así que quedan ${d.ejemplos.demo[0].cuotasTotal - d.ejemplos.demo[0].cuotasPagadas} `
          + `cuotas y el capital pendiente es ${formatearSoles(d.ejemplos.demo[0].capitalPendiente)}.`),
        barraDesglose(d.interesPorCobrar, d.capitalDisponible > 0 ? d.capitalDisponible : 1)))
    : null;

  contenedor.replaceChildren(
    acciones, avisoSinCapital, resumen, porCliente, movimientos, ejemplo,
    h('div', { style: 'height:30px' }),
  );
}

/* ========================================================================== *
 *  Formulario para registrar capital
 * ========================================================================== */

function abrirFormularioCapital(contenedor) {
  const monto = h('input', { type: 'text', inputmode: 'decimal', class: 'monto', placeholder: '800.00' });
  const fecha = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
  const nota = h('input', { type: 'text', placeholder: 'Ej. capital inicial de la caja' });
  const zonaError = h('div', {});
  const boton = h('button', { class: 'btn btn-primario', type: 'button' }, 'Registrar');

  boton.addEventListener('click', async () => {
    boton.disabled = true;
    zonaError.replaceChildren();
    try {
      await api.agregarCapital({ monto: monto.value, fecha: fecha.value, nota: nota.value.trim() });
      ventana.cerrar();
      avisar('Capital registrado.', 'exito');
      refrescar();
    } catch (error) {
      zonaError.replaceChildren(h('div', { class: 'nota-info roja' }, error.message));
      boton.disabled = false;
    }
  });

  const ventana = abrirModal({
    titulo: 'Registrar capital',
    contenido: h('div', {},
      h('div', { class: 'nota-info verde' },
        'Opcional: si no quieres usar esta pantalla, la app funciona igual. '
        + 'Solo sirve para saber cuánto dinero tienes disponible para prestar.'),
      h('div', { class: 'campo' },
        h('label', {}, 'Monto (S/)', h('span', { class: 'obligatorio' }, ' *')), monto),
      h('div', { class: 'fila-campos' },
        h('div', { class: 'campo' }, h('label', {}, 'Fecha'), fecha),
        h('div', { class: 'campo' }, h('label', {}, 'Nota'), nota)),
      zonaError),
    pie: [
      h('button', { class: 'btn btn-claro', type: 'button', onclick: () => ventana.cerrar() }, 'Cancelar'),
      boton,
    ],
  });
}
