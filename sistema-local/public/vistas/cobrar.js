/**
 * ============================================================================
 *  VISTA: A COBRAR
 * ============================================================================
 *  La pantalla de cobranza diaria: hoy, próximos 7 días y vencidas,
 *  con días de atraso y botón de WhatsApp para cada cliente.
 * ============================================================================
 */

import { api } from '/api.js';
import { app, ir, refrescar, suscribir } from '/estado.js';
import {
  h, avisar, formatearSoles, botonWhatsapp, mensajeRecordatorio, mensajeSaldo, icono,
} from '/ui.js';
import { formatearFecha, diasEntre, hoyISO } from '/compartido/calculo.js';

export async function montarCobrar(contenedor) {
  await pintar(contenedor);
  suscribir(() => { pintar(contenedor).catch(console.error); });
}

async function pintar(contenedor) {
  const d = await api.dashboard();
  const hoy = d.hoy || hoyISO();

  const totalHoy = d.tarjetas.cuotasHoy.monto;
  const totalSemana = d.tarjetas.cuotasSemana.monto;
  const totalVencidas = d.tarjetas.cuotasVencidas.monto;

  /* ---------------- Resumen del día ---------------- */

  const resumen = h('div', { class: 'rejilla k3', style: 'margin-bottom:18px' },
    h('button', {
      class: `dato ${totalHoy ? 'ambar' : 'verde'}`,
      style: 'text-align:left;cursor:pointer;font:inherit',
      onclick: () => document.getElementById('grupo-hoy')?.scrollIntoView({ behavior: 'smooth' }),
    },
    h('div', { class: 'titulo' }, 'Para cobrar HOY'),
    h('div', { class: 'monto' }, formatearSoles(totalHoy)),
    h('div', { class: 'nota' }, `${d.tarjetas.cuotasHoy.cantidad} cuota(s) · ${formatearFecha(hoy)}`)),

    h('button', {
      class: 'dato azul', style: 'text-align:left;cursor:pointer;font:inherit',
      onclick: () => document.getElementById('grupo-semana')?.scrollIntoView({ behavior: 'smooth' }),
    },
    h('div', { class: 'titulo' }, 'Próximos 7 días'),
    h('div', { class: 'monto' }, formatearSoles(totalSemana)),
    h('div', { class: 'nota' }, `${d.tarjetas.cuotasSemana.cantidad} cuota(s)`)),

    h('button', {
      class: `dato ${totalVencidas ? 'rojo' : 'verde'}`,
      style: 'text-align:left;cursor:pointer;font:inherit',
      onclick: () => document.getElementById('grupo-vencidas')?.scrollIntoView({ behavior: 'smooth' }),
    },
    h('div', { class: 'titulo' }, 'Vencidas (atrasadas)'),
    h('div', { class: 'monto' }, formatearSoles(totalVencidas)),
    h('div', { class: 'nota' }, `${d.tarjetas.cuotasVencidas.cantidad} cuota(s) sin cobrar`)));

  /* ---------------- Grupos ---------------- */

  const grupoHoy = bloqueGrupo({
    id: 'grupo-hoy', titulo: 'A cobrar hoy', icono: 'diners', tono: 'ambar',
    lista: d.aCobrarHoy, hoy, vacioTexto: 'Hoy no te toca cobrar nada. ¡Ningún cliente te debe hoy!',
  });

  const grupoSemana = bloqueGrupo({
    id: 'grupo-semana', titulo: 'Esta semana', icono: 'calendario', tono: 'azul',
    lista: d.aCobrarSemana, hoy, vacioTexto: 'No hay cuotas programadas para los próximos 7 días.',
  });

  const grupoVencidas = bloqueGrupo({
    id: 'grupo-vencidas', titulo: 'Cuotas vencidas', icono: 'alerta', tono: 'roja',
    lista: d.vencidas, hoy, vacioTexto: 'No tienes cuotas atrasadas. ¡Excelente!',
  });

  /* ---------------- Agrupar vencidas por cliente ---------------- */

  const resumenClientes = new Map();
  for (const item of d.vencidas) {
    const actual = resumenClientes.get(item.cliente) || { cliente: item.cliente, telefono: item.telefono, cuotas: 0, monto: 0 };
    actual.cuotas += 1;
    actual.monto += Number(item.monto);
    resumenClientes.set(item.cliente, actual);
  }

  const bloqueo = resumenClientes.size
    ? h('div', { class: 'tarjeta' },
      h('div', { class: 'tarjeta-cabecera' },
        h('h2', {}, h('span', { class: 'con-icono' }, icono('alerta', 'rojo'), 'Clientes con cuotas atrasadas')),
        h('span', { class: 'crece' }),
        h('span', { class: 'etiqueta roja' },
          `${formatearSoles([...resumenClientes.values()].reduce((s, c) => s + c.monto, 0))}`)),
      h('div', { class: 'tabla-envoltura' },
        h('table', { class: 'tabla plegable' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Cliente'),
            h('th', {}, 'Cuotas'),
            h('th', { class: 'num' }, 'Debe'),
            h('th', { class: 'num' }, ''))),
          h('tbody', {}, ...[...resumenClientes.values()].sort((a, b) => b.monto - a.monto).map((c) => h('tr', {},
            h('td', { class: 'bloque' }, h('strong', {}, c.cliente)),
            h('td', { datosEtiqueta: 'Cuotas' }, `${c.cuotas}`),
            h('td', { datosEtiqueta: 'Debe', class: 'num negrita' }, formatearSoles(c.monto)),
            h('td', {},
              h('div', { style: 'display:flex;gap:6px;justify-content:flex-end' },
                botonWhatsapp(c.telefono, mensajeSaldo({
                  nombreNegocio: app.ajustes.nombreNegocio,
                  cliente: c.cliente,
                  saldo: c.monto,
                  cuotasVencidas: c.cuotas,
                }), 'Cobrar'),
                h('button', {
                  class: 'btn btn-claro btn-pequeno', type: 'button',
                  onclick: () => ir('prestamos'),
                }, 'Préstamos')))))))))
    : null;

  contenedor.replaceChildren(
    h('div', { class: 'acciones' },
      h('button', {
        class: 'btn btn-claro', type: 'button',
        onclick: () => ir('dashboard'),
      }, 'Ver dashboard'),
      h('button', {
        class: 'btn btn-claro', type: 'button',
        onclick: () => ir('prestamos/dia/' + hoy),
      }, 'Ver calendario del mes')),
    resumen,
    bloqueo,
    grupoVencidas,
    grupoHoy,
    grupoSemana,
    h('div', { style: 'height:30px' }),
  );
}

/* ========================================================================== *
 *  Bloque con la lista de cuotas de un grupo
 * ========================================================================== */

function bloqueGrupo({ id, titulo, icono: nombreIcono, tono, lista, hoy, vacioTexto }) {
  const encabezado = h('h2', {}, h('span', { class: 'con-icono' }, icono(nombreIcono), titulo));

  if (!lista.length) {
    return h('div', { class: 'tarjeta', id },
      h('div', { class: 'tarjeta-cabecera' }, encabezado),
      h('div', { class: 'tarjeta-cuerpo' },
        h('p', { style: 'margin:0;color:var(--gris-500)' }, vacioTexto)));
  }

  const total = lista.reduce((s, i) => s + Number(i.monto), 0);
  const porFecha = new Map();
  for (const item of lista) {
    if (!porFecha.has(item.fecha)) porFecha.set(item.fecha, []);
    porFecha.get(item.fecha).push(item);
  }

  const bloquesFecha = [...porFecha.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, items]) => {
      const subtotal = items.reduce((s, i) => s + Number(i.monto), 0);
      const atraso = diasEntre(hoy, fecha);
      const esHoy = fecha === hoy;

      return h('div', { class: 'tarjeta', style: 'box-shadow:none;margin-bottom:12px' },
        h('div', {
          class: 'tarjeta-cabecera',
          style: esHoy ? 'background:var(--ambar-suave)' : (atraso < 0 ? 'background:var(--rojo-suave)' : ''),
        },
        h('h3', {}, esHoy ? `HOY · ${formatearFecha(fecha)}` : formatearFecha(fecha)),
        atraso < 0 ? h('span', { class: 'etiqueta roja' }, `${Math.abs(atraso)} día(s) de atraso`) : null,
        esHoy ? h('span', { class: 'etiqueta ambar' }, 'Cobrar hoy') : null,
        h('span', { class: 'crece' }),
        h('span', { class: 'etiqueta verde' }, formatearSoles(subtotal))),

        h('div', { class: 'tabla-envoltura' },
          h('table', { class: 'tabla plegable' },
            h('thead', {}, h('tr', {},
              h('th', {}, 'Cliente'),
              h('th', {}, 'Cuota'),
              h('th', { class: 'num' }, 'Monto'),
              h('th', { class: 'num' }, 'Capital'),
              h('th', { class: 'num' }, 'Interés'),
              h('th', { class: 'num' }, ''))),
            h('tbody', {}, ...items.map((item) => h('tr', {},
              h('td', { class: 'bloque' },
                h('div', { class: 'celda-cliente' },
                  h('div', { class: 'avatar' }, item.cliente.slice(0, 1).toUpperCase()),
                  h('div', {},
                    h('strong', {}, item.cliente),
                    h('small', {}, item.frecuencia === 'diaria' ? 'Pago diario' : 'Pago semanal')))),
              h('td', { datosEtiqueta: 'Cuota' }, `N.° ${item.numero}`),
              h('td', { datosEtiqueta: 'Monto', class: 'num negrita' },
                formatearSoles(item.monto),
                h('div', {
                  class: 'barra-partes',
                  style: 'margin:5px 0 3px auto',
                  title: `${formatearSoles(item.capital)} de capital + ${formatearSoles(item.interes)} de interés`,
                },
                h('span', { class: 'cap', style: `width:${(Number(item.capital) / (Number(item.monto) || 1)) * 100}%` }),
                h('span', { class: 'int', style: `width:${(Number(item.interes) / (Number(item.monto) || 1)) * 100}%` }))),
              h('td', { datosEtiqueta: 'Capital', class: 'num', style: 'color:var(--verde)' },
                formatearSoles(item.capital)),
              h('td', { datosEtiqueta: 'Interés', class: 'num', style: 'color:var(--ambar)' },
                formatearSoles(item.interes)),
              h('td', {},
                h('div', { style: 'display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap' },
                  botonWhatsapp(item.telefono, mensajeRecordatorio({
                    nombreNegocio: app.ajustes.nombreNegocio,
                    cliente: item.cliente,
                    numeroCuota: item.numero,
                    fecha: formatearFecha(item.fecha),
                    monto: item.monto,
                    interes: item.interes,
                    capital: item.capital,
                  }), 'Recordar'),
                  h('button', {
                    class: 'btn btn-primario btn-pequeno', type: 'button',
                    onclick: async (evento) => {
                      const boton = evento.currentTarget;
                      boton.disabled = true;
                      try {
                        await api.pagarCuota(item.prestamoId, item.numero);
                        avisar(`Cuota ${item.numero} de ${item.cliente} cobrada.`, 'exito');
                        refrescar();
                      } catch (error) {
                        avisar(error.message, 'error');
                        boton.disabled = false;
                      }
                    },
                  }, h('span', { class: 'con-icono' }, icono('check', 'chico'), 'Cobrar')),
                  h('button', {
                    class: 'btn btn-claro btn-pequeno', type: 'button',
                    onclick: () => ir(`prestamos/${item.prestamoId}`),
                  }, 'Abrir')))))))));
    });

  return h('div', { id },
    h('div', { class: 'tarjeta-cabecera', style: 'border:0;padding-left:0' },
      h('h2', {}, titulo),
      h('span', { class: 'crece' }),
      h('span', { class: `etiqueta ${tono}` }, `${lista.length} cuota(s)`),
      h('span', { class: 'etiqueta verde' }, `Total ${formatearSoles(total)}`)),
    ...bloquesFecha);
}
