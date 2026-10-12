/**
 * ============================================================================
 *  VISTA: BANDEJA DE AVISOS
 * ============================================================================
 *  Lista los avisos de cobro anotados por recordatorios.js (1 por día,
 *  guardados en el localStorage del teléfono). Al abrirla marca todo como
 *  leído, así la bolita de la campana vuelve a cero.
 * ============================================================================
 */

import { h, vacio, icono, pintarEn } from '../ui.js';
import {
  leerBandeja, marcarBandejaLeida, limpiarBandeja,
} from '../js/recordatorios.js';
import { formatearFecha, hoyISO } from '../compartido/calculo.js';

let contenedorActivo = null;

// Un solo oyente para toda la vida de la página: si cambia la bandeja
// (por ejemplo al vaciarla) se vuelve a pintar solo si esta pantalla está abierta.
window.addEventListener('bandeja-cambio', () => {
  if (contenedorActivo) pintar(contenedorActivo).catch(console.error);
});

export async function montarBandeja(contenedor) {
  contenedorActivo = contenedor;
  marcarBandejaLeida();
  await pintar(contenedor);
}

async function pintar(contenedor) {
  const avisos = leerBandeja();
  const hoy = hoyISO();

  const acciones = h('div', { class: 'acciones' },
    h('button', {
      class: 'btn btn-claro', type: 'button',
      onclick: () => { location.hash = '#/cobrar'; },
    }, h('span', { class: 'con-icono' }, icono('diners', 'chico'), 'Ir a cobrar')),

    h('span', { class: 'crece', style: 'flex:1' }),

    avisos.length
      ? h('button', {
        class: 'btn btn-peligro btn-pequeno', type: 'button',
        onclick: () => { limpiarBandeja(); },
      }, 'Vaciar bandeja')
      : null);

  const lista = avisos.length
    ? h('div', { class: 'tarjeta' },
      h('div', { class: 'tarjeta-cabecera' },
        h('h2', {}, h('span', { class: 'con-icono' }, icono('campana'), 'Avisos de cobro')),
        h('span', { class: 'crece' }),
        h('span', { class: 'etiqueta azul' }, `${avisos.length} aviso(s)`)),
      h('div', { class: 'tabla-envoltura' },
        h('table', { class: 'tabla plegable' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Día'),
            h('th', {}, 'Aviso'),
            h('th', {}, ''))),
          h('tbody', {}, ...avisos.map((a) => h('tr', {},
            h('td', { datosEtiqueta: 'Día' },
              h('span', { class: `etiqueta ${a.fecha === hoy ? 'verde' : 'gris'}` },
                a.fecha === hoy ? `Hoy · ${formatearFecha(a.fecha)}` : formatearFecha(a.fecha))),
            h('td', { class: 'bloque', datosEtiqueta: 'Aviso' },
              h('strong', {}, a.titulo || 'Recordatorio de cobros'),
              ...(a.lineas || []).map((linea) =>
                h('div', { style: 'font-size:13px;color:var(--gris-700)' }, linea)),
              a.cuerpo && !(a.lineas || []).length
                ? h('div', { style: 'font-size:13px;color:var(--gris-700);white-space:pre-line' }, a.cuerpo)
                : null),
            h('td', { datosEtiqueta: 'Acciones' },
              h('button', {
                class: 'btn btn-primario btn-pequeno', type: 'button',
                onclick: () => { location.hash = '#/cobrar'; },
              }, 'Cobrar'))))))))
    : h('div', { class: 'tarjeta' }, h('div', { class: 'tarjeta-cuerpo' }, vacio(
      'La bandeja está vacía',
      'Aquí aparecerá un aviso el día antes y el mismo día de cada cobro, '
      + 'aunque no tengas permiso de notificaciones del sistema.',
    )));

  pintarEn(
    contenedor,
    acciones,
    lista,
    h('div', { style: 'height:30px' }),
  );
}
