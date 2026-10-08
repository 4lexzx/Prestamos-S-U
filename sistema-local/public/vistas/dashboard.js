/**
 * ============================================================================
 *  VISTA: DASHBOARD
 * ============================================================================
 *  Panel compacto: un círculo con la mezcla de capital e interés, las cifras
 *  clave y un gráfico de lo que entra cada día. Debajo, las cuotas a cobrar
 *  con su desglose de capital e interés.
 * ============================================================================
 */

import { api } from '/api.js';
import { app, ir, refrescar, suscribir } from '/estado.js';
import { h, formatearSoles, botonWhatsapp, mensajeRecordatorio, avisar, icono } from '/ui.js';
import { formatearFecha, diasEntre } from '/compartido/calculo.js';

const COLOR_CAPITAL = '#16a34a';
const COLOR_INTERES = '#f59e0b';

export async function montarDashboard(contenedor) {
  const datos = await api.dashboard();
  const t = datos.tarjetas;
  const dinero = (valor) => formatearSoles(valor);

  contenedor.replaceChildren(
    h('div', { class: 'acciones' },
      h('button', {
        class: 'btn btn-primario', type: 'button',
        onclick: () => ir('prestamos'),
      }, h('span', { class: 'con-icono' }, icono('diners', 'chico'), 'Ver todos los préstamos')),
      h('button', {
        class: 'btn btn-claro', type: 'button',
        onclick: () => ir('cobrar'),
      }, h('span', { class: 'con-icono' }, icono('calendario', 'chico'), 'Ir a cobrar'))),

    /* ---------------- Círculo + cifras clave ---------------- */
    h('div', { class: 'fila-panel' },
      circulo(datos),
      h('div', { class: 'rejilla k2Grow' },
        datoCompacto('Te deben en total', dinero(t.porCobrar), 'azul',
          `${t.clientesActivos} cliente(s) · ${t.prestamosActivos} préstamo(s)`),
        datoCompacto('Interés ganado', dinero(t.interesGanado), 'ambar',
          `Falta cobrar ${dinero(t.interesPorCobrar)}`),
        datoCompacto(t.cuotasVencidas.cantidad ? 'Cuotas vencidas' : 'Sin atrasos',
          dinero(t.cuotasVencidas.monto),
          t.cuotasVencidas.cantidad ? 'rojo' : 'verde',
          t.cuotasVencidas.cantidad
            ? `${t.cuotasVencidas.cantidad} atrasada(s)`
            : 'Todo al día'),
        datoCompacto('Esta semana', dinero(t.cuotasSemana.monto), 'azul',
          `${t.cuotasSemana.cantidad} cuota(s) en 7 días`))),

    /* ---------------- Montañas: cuánto entra cada día ---------------- */
    montanas(datos, datos.hoy),

    /* ---------------- Hoy / semana / vencidas, en una sola fila ---------------- */
    filaResumen(datos, t, datos.hoy),

    /* ---------------- Listas de cuotas ---------------- */
    h('div', { style: 'display:grid;gap:14px' },
      tarjetaCobrar('diners', 'Para cobrar hoy', datos.aCobrarHoy, datos.hoy, 'hoy'),
      tarjetaCobrar('calendario', 'Próximos 7 días', datos.aCobrarSemana, datos.hoy, 'semana'),
      tarjetaCobrar('alerta', 'Cuotas vencidas', datos.vencidas, datos.hoy, 'vencidas')),
  );

  suscribir(() => { montarDashboard(contenedor).catch(console.error); });
}

/* ========================================================================== *
 *  Gráfico de círculo: de lo que te deben, qué parte es capital y qué interés
 * ========================================================================== */

function circulo(datos) {
  const t = datos.tarjetas;
  const total = Number(t.porCobrar) || 0;
  const capital = Number(t.capitalPendiente) || 0;
  const interes = Number(t.interesPorCobrar) || 0;
  const pctCapital = total > 0 ? (capital / total) * 100 : 0;
  const pctInteres = total > 0 ? (interes / total) * 100 : 0;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('class', 'circulo-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Te deben ${formatearSoles(total)}: ${formatearSoles(capital)} de capital y ${formatearSoles(interes)} de interés`);

  const crear = (nombre, attrs) => {
    const el = document.createElementNS(SVG_NS, nombre);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  // Aro de fondo
  svg.appendChild(crear('circle', {
    cx: 60, cy: 60, r: 46, fill: 'none',
    stroke: 'var(--gris-200)', 'stroke-width': 17,
  }));

  if (total > 0) {
    const largo = 2 * Math.PI * 46;
    svg.appendChild(crear('circle', {
      cx: 60, cy: 60, r: 46, fill: 'none',
      stroke: COLOR_CAPITAL, 'stroke-width': 17, 'stroke-linecap': 'butt',
      'stroke-dasharray': `${(pctCapital / 100) * largo} ${largo}`,
      'stroke-dashoffset': 0,
      transform: 'rotate(-90 60 60)',
    }));
    if (pctInteres > 0) {
      svg.appendChild(crear('circle', {
        cx: 60, cy: 60, r: 46, fill: 'none',
        stroke: COLOR_INTERES, 'stroke-width': 17, 'stroke-linecap': 'butt',
        'stroke-dasharray': `${(pctInteres / 100) * largo} ${largo}`,
        'stroke-dashoffset': `${-(pctCapital / 100) * largo}`,
        transform: 'rotate(-90 60 60)',
      }));
    }
  }

  // Texto dentro del hueco: líneas cortas para que nunca toque el anillo
  const centrar = (valor, y, tamano, peso, relleno) => {
    const linea = crear('text', {
      x: 60, y, 'text-anchor': 'middle', 'font-size': tamano,
      'font-weight': peso, fill: relleno,
    });
    linea.textContent = valor;
    return linea;
  };

  svg.append(...[
    total > 0 ? centrar('Te deben', 49, 9.5, 600, 'var(--gris-500)') : null,
    total > 0
      ? centrar(`${Math.round(pctCapital)}%`, 65, 15, 700, 'var(--gris-900)')
      : centrar('Sin deuda', 64, 12, 700, 'var(--gris-900)'),
    total > 0 ? centrar('capital', 77, 9, 600, 'var(--gris-500)') : null,
  ].filter(Boolean));

  return h('div', { class: 'tarjeta panel-circulo' },
    h('div', { class: 'circulo-caja' }, svg,
      h('div', { class: 'circola-leyenda' },
        h('div', { class: 'leyenda-fila' },
          h('i', { style: `background:${COLOR_CAPITAL}` }),
          h('span', {}, 'Capital por recuperar'),
          h('b', {}, formatearSoles(capital))),
        h('div', { class: 'leyenda-fila' },
          h('i', { style: `background:${COLOR_INTERES}` }),
          h('span', {}, 'Interés por ganar'),
          h('b', {}, formatearSoles(interes))))));
}

/* ========================================================================== *
 *  Tarjeta de número, versión chica
 * ========================================================================== */

function datoCompacto(titulo, valor, tono, nota) {
  return h('div', { class: `dato compacto ${tono}` },
    h('div', { class: 'titulo' }, titulo),
    h('div', { class: 'monto' }, valor),
    h('div', { class: 'nota' }, nota));
}

/* ========================================================================== *
 *  Montañas: gráfico de línea con el dinero que entra cada día
 * ========================================================================== */

function montanas(datos, hoyISO) {
  // Los días se sacan de las cuotas que realmente existen, para que el total
  // del gráfico sea siempre el mismo que ves en la lista de abajo
  const todas = [...datos.aCobrarHoy, ...datos.aCobrarSemana];
  const fechas = [...new Set(todas.map((item) => item.fecha))].sort();
  const dias = fechas.slice(0, 8).map((fecha) => {
    const delDia = todas.filter((item) => item.fecha === fecha);
    return {
      fecha,
      monto: delDia.reduce((s, x) => s + Number(x.monto), 0),
      cantidad: delDia.length,
    };
  });

  if (!dias.length) {
    return h('div', { class: 'tarjeta panel-montanas' },
      h('div', { class: 'tarjeta-cabecera compacta' },
        h('h3', {}, h('span', { class: 'con-icono' }, icono('grafico', 'chico'), 'Cuánto entra cada día')),
        h('span', { class: 'crece' }),
        h('span', { class: 'etiqueta verde' }, 'Sin cobros próximos')),
      h('div', { class: 'tarjeta-cuerpo compacta' },
        h('p', { class: 'vacio-linea' }, 'No hay cobros en los próximos 7 días.')));
  }

  const maximo = Math.max(...dias.map((d) => d.monto), 1);
  const total = dias.reduce((s, d) => s + d.monto, 0);

  const ANCHO = 700;
  const ALTO = 76;
  const paso = ANCHO / (dias.length - 1);
  const puntos = dias.map((d, i) => ({
    x: i * paso,
    y: ALTO - (d.monto / maximo) * (ALTO - 12) - 2,
    dia: d,
    i,
  }));

  // Línea suave que une los puntos, con forma de montañas
  let linea = `M ${puntos[0].x},${puntos[0].y}`;
  for (let i = 1; i < puntos.length; i += 1) {
    const previo = puntos[i - 1];
    const actual = puntos[i];
    const medio = (previo.x + actual.x) / 2;
    linea += ` C ${medio},${previo.y} ${medio},${actual.y} ${actual.x},${actual.y}`;
  }
  const area = `${linea} L ${puntos[puntos.length - 1].x},${ALTO} L ${puntos[0].x},${ALTO} Z`;

  const NS = 'http://www.w3.org/2000/svg';
  const crear = (nombre, attrs) => {
    const el = document.createElementNS(NS, nombre);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${ANCHO} ${ALTO}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'montanas-svg');

  const degradado = crear('linearGradient', { id: 'degradadoMontanas', x1: 0, y1: 0, x2: 0, y2: 1 });
  degradado.appendChild(crear('stop', { offset: '0%', 'stop-color': COLOR_CAPITAL, 'stop-opacity': .28 }));
  degradado.appendChild(crear('stop', { offset: '100%', 'stop-color': COLOR_CAPITAL, 'stop-opacity': .02 }));
  const defs = crear('defs', {});
  defs.appendChild(degradado);
  svg.appendChild(defs);

  svg.appendChild(crear('path', { d: area, fill: 'url(#degradadoMontanas)' }));
  svg.appendChild(crear('path', {
    d: linea, fill: 'none', stroke: COLOR_CAPITAL, 'stroke-width': 2,
    'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke',
  }));

  for (const p of puntos) {
    svg.appendChild(crear('circle', {
      cx: p.x, cy: p.y, r: 2.6,
      fill: p.i === 0 ? COLOR_INTERES : '#fff',
      stroke: p.i === 0 ? COLOR_INTERES : COLOR_CAPITAL,
      'stroke-width': 1.6, 'vector-effect': 'non-scaling-stroke',
    }));
  }

  return h('div', { class: 'tarjeta panel-montanas' },
    h('div', { class: 'tarjeta-cabecera compacta' },
      h('h3', {}, h('span', { class: 'con-icono' }, icono('grafico', 'chico'), 'Cuánto entra cada día')),
      h('span', { class: 'crece' }),
      h('span', { class: 'etiqueta verde' }, `${dias.length} día(s): ${formatearSoles(total)}`)),
    h('div', { class: 'tarjeta-cuerpo compacta' }, svg,
      h('div', { class: 'montanas-eje', style: `grid-template-columns:repeat(${dias.length}, 1fr)` },
        ...dias.map((d, i) => h('span', { class: d.fecha === hoyISO ? 'hoy' : '' },
          d.fecha === hoyISO ? 'Hoy' : d.fecha.slice(8) + '/' + d.fecha.slice(5, 7),
          h('em', {}, `S/ ${d.monto}`))))));
}

/* ========================================================================== *
 *  Hoy / 7 días / vencidas, compacto en una sola tarjeta
 * ========================================================================== */

function filaResumen(datos, t, hoyISO) {
  const bloques = [
    { nombre: 'diners', titulo: 'Hoy', lista: datos.aCobrarHoy, tono: t.cuotasHoy.cantidad ? 'ambar' : 'verde' },
    { nombre: 'calendario', titulo: 'Próximos 7 días', lista: datos.aCobrarSemana, tono: 'azul' },
    { nombre: 'alerta', titulo: 'Vencidas', lista: datos.vencidas, tono: t.cuotasVencidas.cantidad ? 'rojo' : 'verde' },
  ];

  return h('div', { class: 'tarjeta panel-resumen' },
    ...bloques.map(({ nombre, titulo, lista, tono }) => {
      const total = lista.reduce((s, x) => s + Number(x.monto), 0);
      const capital = lista.reduce((s, x) => s + Number(x.capital), 0);
      const interes = lista.reduce((s, x) => s + Number(x.interes), 0);
      const base = total || 1;

      return h('div', { class: `resumen-caja ${tono}` },
        h('div', { class: 'resumen-titulo' },
          icono(nombre, 'chico'), h('span', {}, titulo),
          h('span', { class: 'resumen-cantidad' }, `${lista.length}`)),
        h('div', { class: 'resumen-monto' }, formatearSoles(total)),
        total > 0
          ? h('div', {},
            h('div', { class: 'barra-partes', style: 'margin:6px 0 5px' },
              h('span', { class: 'cap', style: `width:${(capital / base) * 100}%` }),
              h('span', { class: 'int', style: `width:${(interes / base) * 100}%` })),
            h('div', { class: 'resumen-desglose' },
              h('span', { class: 'cap' }, `cap. ${formatearSoles(capital)}`),
              h('span', { class: 'int' }, `int. ${formatearSoles(interes)}`)))
          : h('div', { class: 'resumen-desglose' }, 'Nada que cobrar'));
    }));
}

/* ========================================================================== *
 *  Tarjeta con la lista de cuotas a cobrar
 * ========================================================================== */

function tarjetaCobrar(nombreIcono, titulo, lista, hoyISO, modo) {
  const total = lista.reduce((s, x) => s + Number(x.monto), 0);

  if (!lista.length) {
    return h('div', { class: 'tarjeta' },
      h('div', { class: 'tarjeta-cabecera compacta' },
        h('h3', {}, h('span', { class: 'con-icono' }, icono(nombreIcono, 'verde'), titulo)),
        h('span', { class: 'crece' }),
        h('span', { class: 'etiqueta verde' }, 'Al día')),
      h('div', { class: 'tarjeta-cuerpo compacta' },
        h('p', { class: 'vacio-linea' }, modo === 'vencidas'
          ? 'No tienes cuotas atrasadas. Excelente.'
          : 'No hay cuotas para esta fecha.')));
  }

  const filas = lista.map((item) => {
    // diasEntre da positivo hacia el futuro: negativo = ya se venció
    const dias = diasEntre(hoyISO, item.fecha);
    const vencido = dias < 0;
    const esHoy = item.fecha === hoyISO;
    const tono = vencido ? 'roja' : (esHoy ? 'ambar' : 'gris');
    const textoEstado = vencido
      ? `${Math.abs(dias)} día(s) de atraso`
      : (esHoy ? 'Vence hoy' : formatearFecha(item.fecha));
    const base = Number(item.monto) || 1;

    return h('tr', {},
      h('td', { class: 'bloque', datosEtiqueta: 'Cliente' },
        h('div', { class: 'celda-cliente' },
          h('div', { class: 'avatar' }, item.cliente.slice(0, 1).toUpperCase()),
          h('div', {},
            h('strong', {}, item.cliente),
            h('small', {}, `Cuota ${item.numero} · ${item.frecuencia === 'diaria' ? 'diaria' : 'semanal'}`)))),

      h('td', { datosEtiqueta: 'Vence' },
        h('span', { class: `etiqueta ${tono}` }, textoEstado)),

      h('td', { datosEtiqueta: 'Cuota', class: 'num negrita' },
        formatearSoles(item.monto),
        h('div', {
          class: 'barra-partes',
          style: 'margin:5px 0 3px auto',
          title: `${formatearSoles(item.capital)} de capital + ${formatearSoles(item.interes)} de interés`,
        },
        h('span', { class: 'cap', style: `width:${(Number(item.capital) / base) * 100}%` }),
        h('span', { class: 'int', style: `width:${(Number(item.interes) / base) * 100}%` }))),

      h('td', { datosEtiqueta: 'Capital', class: 'num' },
        h('span', { style: 'color:var(--verde)' }, formatearSoles(item.capital))),

      h('td', { datosEtiqueta: 'Interés', class: 'num' },
        h('span', { style: 'color:var(--ambar)' }, formatearSoles(item.interes))),

      h('td', { datosEtiqueta: 'Acciones' },
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
                avisar(`Cuota ${item.numero} de ${item.cliente} marcada como pagada.`, 'exito');
                refrescar();
              } catch (error) {
                avisar(error.message, 'error');
                boton.disabled = false;
              }
            },
          }, 'Cobrar'))));
  });

  return h('div', { class: 'tarjeta' },
    h('div', { class: 'tarjeta-cabecera compacta' },
      h('h3', {}, h('span', { class: 'con-icono' }, icono(nombreIcono), titulo)),
      h('span', { class: 'crece' }),
      h('span', { class: 'etiqueta azul' }, `${lista.length} cuota(s)`),
      h('span', { class: 'etiqueta verde' }, `Total ${formatearSoles(total)}`)),
    h('div', { class: 'tabla-envoltura' },
      h('table', { class: 'tabla plegable' },
        h('thead', {}, h('tr', {},
          h('th', {}, 'Cliente'),
          h('th', {}, 'Vence'),
          h('th', { class: 'num' }, 'Cuota'),
          h('th', { class: 'num' }, 'Capital'),
          h('th', { class: 'num' }, 'Interés'),
          h('th', { class: 'num' }, 'Acciones'))),
        h('tbody', {}, ...filas))));
}