/**
 * ============================================================================
 *  VISTA: HISTORIAL DE UN CLIENTE
 * ============================================================================
 *  Datos del cliente + todos sus préstamos (activos y terminados) + el saldo
 *  que todavía te debe. Es la pantalla a la que llega el usuario al tocar
 *  un cliente en "Préstamos → Por cliente".
 * ============================================================================
 */

import { api } from '/api.js';
import { app, ir, refrescar } from '/estado.js';
import {
h, vacio, iniciales, formatearSoles, barraProgreso,
    botonWhatsapp, mensajeSaldo, icono,
  } from '/ui.js';
import { formatearFecha, hoyISO } from '/compartido/calculo.js';
import { abrirFormularioCliente } from '/vistas/clientes.js';

export async function montarCliente(contenedor, { id }) {
  if (!id) { ir('clientes'); return; }
  const { cliente } = await api.cliente(id);
  const r = await api.prestamos('todos', id);
  const hoy = hoyISO();

  const activos = r.filter((p) => p.estado === 'activo');
  const terminados = r.filter((p) => p.estado === 'terminado');
  const cerrados = r.filter((p) => p.estado === 'cerrado_refinanciado');

  const totalPrestado = activos.reduce((s, p) => s + Number(p.monto), 0);
  const capitalRecuperado = activos.reduce((s, p) => s + Number(p.resumen.capitalRecuperado), 0);
  const capitalPendiente = activos.reduce((s, p) => s + Number(p.resumen.capitalPendiente), 0);
  const porCobrar = activos.reduce((s, p) => s + Number(p.resumen.pendiente), 0);
  const interesGanado = r.reduce((s, p) => s + Number(p.resumen.interesCobrado), 0);
  const interesPorCobrar = activos.reduce((s, p) => s + Number(p.resumen.interesPorCobrar), 0);
  const cuotasVencidas = activos.reduce((s, p) => s + p.resumen.cuotasVencidas, 0);

  const acciones = h('div', { class: 'acciones' },
    h('button', { class: 'btn btn-claro', type: 'button', onclick: () => ir('prestamos') },
      h('span', { class: 'con-icono' }, icono('flecha'), 'Volver')),
    h('button', {
      class: 'btn btn-claro', type: 'button',
      onclick: () => abrirFormularioCliente(cliente),
    }, 'Editar cliente'),
    porCobrar > 0
      ? botonWhatsapp(cliente.telefono, mensajeSaldo({
        nombreNegocio: app.ajustes.nombreNegocio,
        cliente: cliente.nombre,
        saldo: porCobrar,
        capitalPendiente,
        cuotasVencidas,
      }), 'Recordar saldo', false)
      : null,
    h('span', { style: 'flex:1' }),
    h('button', {
      class: 'btn btn-primario', type: 'button',
      onclick: async () => {
        const { abrirFormularioPrestamo } = await import('/modales/prestamo-form.js');
        abrirFormularioPrestamo({
          clienteId: cliente.id,
          alGuardar: () => { ir(`clientes/${cliente.id}`); refrescar(); },
        });
      },
    }, '+ Nuevo préstamo a este cliente'));

  const ficha = h('div', { class: 'tarjeta' },
    h('div', { class: 'tarjeta-cabecera' },
      h('div', { class: 'avatar' }, iniciales(cliente.nombre)),
      h('div', {},
        h('h2', {}, cliente.nombre),
        h('div', { class: 'sub' }, [cliente.telefono, cliente.dni, cliente.ubicacion].filter(Boolean).join(' · ') || 'Sin datos de contacto')),
      h('span', { class: 'crece' }),
      activos.length
        ? h('span', { class: 'etiqueta verde' }, `${activos.length} préstamo(s) activo(s)`)
        : h('span', { class: 'etiqueta gris' }, 'Sin deuda actual')),

    h('div', { class: 'tarjeta-cuerpo' },
      cliente.notas
        ? h('div', { class: 'nota-info', style: 'margin-bottom:14px' }, cliente.notas)
        : null,

      h('div', { class: 'lista-datos' },
        h('div', { class: 'dato-caja' }, h('div', { class: 'et' }, 'Prestado ahora'),
          h('div', { class: 'vl' }, formatearSoles(totalPrestado))),
        h('div', { class: 'dato-caja capital' }, h('div', { class: 'et' }, 'Capital recuperado'),
          h('div', { class: 'vl' }, formatearSoles(capitalRecuperado))),
        h('div', { class: 'dato-caja capital' }, h('div', { class: 'et' }, 'Capital pendiente'),
          h('div', { class: 'vl' }, formatearSoles(capitalPendiente))),
        h('div', { class: `dato-caja ${porCobrar ? 'rojo' : ''}` }, h('div', { class: 'et' }, 'Saldo por cobrar'),
          h('div', { class: 'vl' }, formatearSoles(porCobrar)),
          h('div', { class: 'ayuda' },
            cuotasVencidas ? `${cuotasVencidas} cuota(s) vencida(s)` : 'Al día')),
        h('div', { class: 'dato-caja interes' }, h('div', { class: 'et' }, 'Interés ganado (histórico)'),
          h('div', { class: 'vl' }, formatearSoles(interesGanado))),
        h('div', { class: 'dato-caja interes' }, h('div', { class: 'et' }, 'Interés por cobrar'),
          h('div', { class: 'vl' }, formatearSoles(interesPorCobrar))))));

  const listaPrestamos = (titulo, lista) => {
    if (!lista.length) return null;
    return h('div', { class: 'tarjeta' },
      h('div', { class: 'tarjeta-cabecera' },
        h('h2', {}, titulo),
        h('span', { class: 'crece' }),
        h('span', { class: 'etiqueta azul' }, String(lista.length))),
      h('div', { class: 'tarjeta-cuerpo' },
        h('div', { class: 'apilado' }, ...lista.map((p) => tarjetaPrestamo(p, hoy)))));
  };

  const sinPrestamos = (!activos.length && !terminados.length && !cerrados.length)
    ? h('div', { class: 'tarjeta' }, h('div', { class: 'tarjeta-cuerpo' }, vacio(
      'Este cliente no tiene préstamos',
      'Cuando le prestes dinero aparecerá aquí con todo su historial.',
      '+ Nuevo préstamo',
      async () => {
        const { abrirFormularioPrestamo } = await import('/modales/prestamo-form.js');
        abrirFormularioPrestamo({
          clienteId: cliente.id,
          alGuardar: () => { ir(`clientes/${cliente.id}`); refrescar(); },
        });
      },
    )))
    : null;

  contenedor.replaceChildren(
    acciones,
    ficha,
    listaPrestamos('Préstamos activos', activos),
    listaPrestamos('Préstamos terminados', terminados),
    listaPrestamos('Cerrados por refinanciamiento', cerrados),
    sinPrestamos,
    h('div', { style: 'height:30px' }),
  );
}

/* ========================================================================== *
 *  Tarjeta de un préstamo dentro del historial
 * ========================================================================== */

function tarjetaPrestamo(p, hoy) {
  const r = p.resumen;
  const estado = p.estado === 'activo' ? ['verde', 'Activo']
    : p.estado === 'terminado' ? ['azul', 'Terminado'] : ['gris', 'Refinanciado'];

  return h('div', {
    style: 'border:1px solid var(--gris-200);border-radius:var(--radio);padding:14px;cursor:pointer',
    onclick: () => ir(`prestamos/${p.id}`),
  },
  h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px' },
    h('strong', {}, `Préstamo #${p.id}`),
    h('span', { class: `etiqueta ${estado[0]}` }, estado[1]),
    h('span', { class: 'crece', style: 'flex:1' }),
    h('span', { style: 'font-size:13px;color:var(--gris-500)' },
      `${formatearFecha(p.fecha_inicio)} · ${p.num_cuotas} cuota(s) ${p.frecuencia === 'diaria' ? 'diarias' : 'semanales'}`)),

  h('div', { class: 'lista-datos', style: 'margin-bottom:12px' },
    h('div', { class: 'dato-caja' }, h('div', { class: 'et' }, 'Monto'),
      h('div', { class: 'vl chico' }, formatearSoles(p.monto))),
    h('div', { class: 'dato-caja' }, h('div', { class: 'et' }, 'Cuota'),
      h('div', { class: 'vl chico' }, formatearSoles(p.cuota))),
    h('div', { class: 'dato-caja' }, h('div', { class: 'et' }, 'Interés total'),
      h('div', { class: 'vl chico' }, formatearSoles(p.interes_total))),
    h('div', { class: 'dato-caja capital' }, h('div', { class: 'et' }, 'Capital pendiente'),
      h('div', { class: 'vl chico' }, formatearSoles(r.capitalPendiente))),
    h('div', { class: 'dato-caja' }, h('div', { class: 'et' }, 'Saldo por cobrar'),
      h('div', { class: 'vl chico' }, formatearSoles(r.pendiente)))),

  barraProgreso(`${r.cuotasPagadas} de ${r.cuotasTotal} cuotas`, r.progreso,
    r.cuotasVencidas ? 'var(--ambar)' : 'var(--verde-claro)'),

  r.cuotasVencidas
    ? h('div', { style: 'margin-top:10px' },
      h('span', { class: 'etiqueta roja' },
        h('span', { class: 'con-icono' }, icono('alerta', 'chico'), `${r.cuotasVencidas} cuota(s) vencida(s)`)))
    : null);
}
