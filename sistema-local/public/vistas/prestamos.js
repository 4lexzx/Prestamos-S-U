/**
 * ============================================================================
 *  VISTA: PRÉSTAMOS
 * ============================================================================
 *  Un interruptor cambia entre las dos formas de verlos:
 *    a) POR CLIENTE - lista de clientes; al entrar, sus préstamos (activos y terminados)
 *    b) POR FECHA  - calendario mensual + lista de "qué cobro cada día"
 *  Con filtros de activos, terminados y vencidos.
 * ============================================================================
 */

import { api } from '/api.js';
import { ir, refrescar, suscribir } from '/estado.js';
import { h, vacio, iniciales, formatearSoles } from '/ui.js';
import { formatearFecha, nombreMes, hoyISO } from '/compartido/calculo.js';

const FILTROS = [
  { valor: 'activos', texto: 'Activos' },
  { valor: 'terminados', texto: 'Terminados' },
  { valor: 'vencidos', texto: 'Vencidos' },
  { valor: 'todos', texto: 'Todos' },
];

export async function montarPrestamos(contenedor, { diaSeleccionada = null } = {}) {
  const hoy = hoyISO();
  const ahora = new Date();
  const estado = {
    modo: sessionStorage.getItem('modoPrestamos') || (diaSeleccionada ? 'fecha' : 'cliente'),
    filtro: sessionStorage.getItem('filtroPrestamos') || 'activos',
    mes: ahora.getMonth(),
    anio: ahora.getFullYear(),
    diaSeleccionada,
  };
  if (diaSeleccionada) {
    const [anio, mes] = diaSeleccionada.split('-').map(Number);
    estado.mes = mes - 1;
    estado.anio = anio;
  }

  const zonaContenido = h('div', {});
  const zonaFiltros = h('div', { class: 'filtros' });
  const zonaInterruptor = h('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:14px' });

  /* ---------------- Interruptor de vista ---------------- */

  const btnCliente = h('button', { type: 'button', class: estado.modo === 'cliente' ? 'activo' : '' }, 'Por cliente');
  const btnFecha = h('button', { type: 'button', class: estado.modo === 'fecha' ? 'activo' : '' }, 'Por fecha (calendario)');

  btnCliente.addEventListener('click', () => {
    estado.modo = 'cliente';
    sessionStorage.setItem('modoPrestamos', 'cliente');
    pintar();
  });
  btnFecha.addEventListener('click', () => {
    estado.modo = 'fecha';
    sessionStorage.setItem('modoPrestamos', 'fecha');
    pintar();
  });

  zonaInterruptor.replaceChildren(h('div', { class: 'interruptor' }, btnCliente, btnFecha));

  /* ---------------- Filtros ---------------- */

  async function pintarFiltros() {
    const todos = await api.prestamos('todos');
    const cuenta = (filtro) => {
      if (filtro === 'activos') return todos.filter((p) => p.estado === 'activo').length;
      if (filtro === 'terminados') return todos.filter((p) => p.estado === 'terminado').length;
      if (filtro === 'vencidos') return todos.filter((p) => p.estado === 'activo' && p.resumen.cuotasVencidas > 0).length;
      return todos.length;
    };

    zonaFiltros.replaceChildren(...FILTROS.map((filtro) => h('button', {
      class: `pastilla ${estado.filtro === filtro.valor ? 'activo' : ''}`,
      type: 'button',
      onclick: () => {
        estado.filtro = filtro.valor;
        sessionStorage.setItem('filtroPrestamos', filtro.valor);
        pintar();
      },
    }, filtro.texto, h('span', { class: 'cuenta' }, String(cuenta(filtro.valor))))));
  }

  /* ---------------- Selector de fecha del calendario ---------------- */

  const zonaCalendario = h('div', {});

  function cabeceraMes() {
    const anterior = h('button', { class: 'btn btn-claro btn-pequeno', type: 'button' }, '‹');
    const siguiente = h('button', { class: 'btn btn-claro btn-pequeno', type: 'button' }, '›');

    anterior.addEventListener('click', () => {
      estado.mes -= 1;
      if (estado.mes < 0) { estado.mes = 11; estado.anio -= 1; }
      pintar();
    });
    siguiente.addEventListener('click', () => {
      estado.mes += 1;
      if (estado.mes > 11) { estado.mes = 0; estado.anio += 1; }
      pintar();
    });

    return h('div', { class: 'tarjeta-cabecera' },
      anterior,
      h('h2', { style: 'min-width:160px;text-align:center' }, nombreMes(estado.anio, estado.mes)),
      siguiente,
      h('span', { class: 'crece' }),
      h('button', {
        class: 'btn btn-claro btn-pequeno', type: 'button',
        onclick: () => {
          const ahora2 = new Date();
          estado.mes = ahora2.getMonth();
          estado.anio = ahora2.getFullYear();
          pintar();
        },
      }, 'Hoy'));
  }

  /* ---------------- Pintado ---------------- */

  async function pintar() {
    await pintarFiltros();
    if (estado.modo === 'cliente') await pintarPorCliente();
    else await pintarPorFecha();
  }

  /* --------- a) POR CLIENTE --------- */

  async function pintarPorCliente() {
    const prestamos = await api.prestamos(estado.filtro);
    const clientes = await api.clientes();

    if (!clientes.length) {
      zonaContenido.replaceChildren(h('div', { class: 'tarjeta' },
        h('div', { class: 'tarjeta-cuerpo' }, vacio(
          'No hay clientes registrados',
          'Crea un cliente y después dale su primer préstamo.',
          '+ Nuevo préstamo',
          async () => {
            const { abrirFormularioPrestamo } = await import('/modales/prestamo-form.js');
            abrirFormularioPrestamo({ alGuardar: pintar });
          },
        ))));
      return;
    }

    // Agrupamos los préstamos del filtro actual por cliente
    const porCliente = new Map();
    for (const prestamo of prestamos) {
      if (!porCliente.has(prestamo.cliente_id)) porCliente.set(prestamo.cliente_id, []);
      porCliente.get(prestamo.cliente_id).push(prestamo);
    }

    // Con el filtro "activos", también mostramos los clientes sin deuda para que no desaparezcan
    const idsAMostrar = estado.filtro === 'activos'
      ? clientes
      : clientes.filter((c) => porCliente.has(c.id));

    if (!idsAMostrar.length) {
      zonaContenido.replaceChildren(h('div', { class: 'tarjeta' },
        h('div', { class: 'tarjeta-cuerpo' }, vacio(
          'Nada que mostrar con este filtro',
          'Prueba con "Todos" o cambia a la vista de calendario.'))));
      return;
    }

    const filas = idsAMostrar.map((cliente) => {
      const suyos = porCliente.get(cliente.id) || [];
      const activos = suyos.filter((p) => p.estado === 'activo');
      const terminados = suyos.filter((p) => p.estado === 'terminado');
      const pendiente = activos.reduce((s, p) => s + Number(p.resumen.pendiente), 0);
      const vencidas = activos.reduce((s, p) => s + p.resumen.cuotasVencidas, 0);

      const abrirHistorial = () => ir(`clientes/${cliente.id}`);

      return h('tr', { style: 'cursor:pointer', onclick: abrirHistorial },
        h('td', { class: 'bloque' },
          h('div', { class: 'celda-cliente' },
            h('div', { class: 'avatar' }, iniciales(cliente.nombre)),
            h('div', {},
              h('strong', {}, cliente.nombre),
              h('small', {}, cliente.telefono || 'Sin teléfono')))),
        h('td', { datosEtiqueta: 'Activos' },
          activos.length
            ? h('span', { class: 'etiqueta verde' }, String(activos.length))
            : h('span', { class: 'etiqueta gris' }, '0')),
        h('td', { datosEtiqueta: 'Terminados' },
          terminados.length
            ? h('span', { class: 'etiqueta azul' }, String(terminados.length))
            : h('span', { class: 'etiqueta gris' }, '0')),
        h('td', { datosEtiqueta: 'Saldo pendiente', class: 'num negrita' },
          pendiente ? formatearSoles(pendiente) : '—'),
        h('td', { datosEtiqueta: 'Atraso' },
          vencidas
            ? h('span', { class: 'etiqueta roja' }, `${vencidas} cuota(s)`)
            : h('span', { class: 'etiqueta verde' }, 'Al día')),
        h('td', {},
          h('div', { style: 'display:flex;gap:6px;justify-content:flex-end' },
            h('button', {
              class: 'btn btn-claro btn-pequeno', type: 'button',
              onclick: (evento) => { evento.stopPropagation(); abrirHistorial(); },
            }, 'Ver préstamos'))));
    });

    zonaContenido.replaceChildren(
      h('div', { class: 'nota-info' },
        'Toca un cliente para ver TODOS sus préstamos: los activos y también los ya terminados.'),
      h('div', { class: 'tarjeta' },
        h('div', { class: 'tarjeta-cabecera' },
          h('h2', {}, 'Clientes con préstamos'),
          h('span', { class: 'crece' }),
          h('span', { class: 'etiqueta azul' }, `${idsAMostrar.length}`)),
        h('div', { class: 'tabla-envoltura' },
          h('table', { class: 'tabla plegable' },
            h('thead', {}, h('tr', {},
              h('th', {}, 'Cliente'),
              h('th', {}, 'Activos'),
              h('th', {}, 'Terminados'),
              h('th', { class: 'num' }, 'Saldo pendiente'),
              h('th', {}, 'Atraso'),
              h('th', {}))),
            h('tbody', {}, ...filas)))),
    );
  }

  /* --------- b) POR FECHA (calendario) --------- */

  async function pintarPorFecha() {
    const [calendario, prestamos] = await Promise.all([
      api.calendario(estado.mes, estado.anio),
      api.prestamos(estado.filtro),
    ]);

    const filtrados = new Set(prestamos.map((p) => p.id));
    const detalleCliente = new Map(prestamos.map((p) => [p.id, p.cliente_nombre]));

    // Mapa día -> lista de cuotas (con color)
    const cuotasDelDia = new Map();
    for (const dia of calendario.dias) {
      const items = dia.cuotas
        .filter((cuota) => filtrados.has(cuota.prestamo_id))
        .map((cuota) => ({
          ...cuota,
          nombreCliente: detalleCliente.get(cuota.prestamo_id) || cuota.cliente,
          tono: cuota.estado === 'pagada' ? 'pagada' : (cuota.fecha === hoy ? 'hoy' : (cuota.fecha < hoy ? 'vencida' : 'futura')),
        }));
      cuotasDelDia.set(dia.fecha, items);
    }

    /* --- Calendario --- */
    const diasSemana = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
    // La semana Peruana empieza en lunes
    const primerDia = new Date(Date.UTC(estado.anio, estado.mes, 1)).getUTCDay();
    const desplazamiento = (primerDia + 6) % 7;

    const celdas = [
      ...diasSemana.map((d) => h('div', { class: 'cabecera-dia' }, d)),
      ...Array.from({ length: desplazamiento }, () => h('div', { class: 'celda vacia' })),
      ...calendario.dias.map((dia) => {
        const items = cuotasDelDia.get(dia.fecha) || [];
        const total = items.filter((i) => i.tono !== 'pagada')
          .reduce((s, i) => s + Number(i.monto), 0);
        const tieneVencida = items.some((i) => i.tono === 'vencida');

        const celda = h('div', {
          class: `celda ${dia.esHoy ? 'hoy' : ''}`,
          title: items.length
            ? items.map((i) => `${i.nombreCliente} - Cuota ${i.numero}: S/ ${Number(i.monto).toFixed(2)} (${i.tono})`).join('\n')
            : 'Sin cuotas este día',
          onclick: () => ir(`prestamos/dia/${dia.fecha}`),
        },
        h('div', { style: 'display:flex;justify-content:space-between;align-items:center' },
          h('span', { class: 'celdia-num' }, String(dia.dia)),
          total > 0
            ? h('span', { class: 'punto', style: tieneVencida ? 'background:var(--rojo)' : '' },
              `S/ ${total.toFixed(0)}`)
            : null),
        ...items.slice(0, 3).map((i) => h('div', { class: 'mini-cuota' },
          h('span', {
            style: `display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:4px;`
              + `background:${i.tono === 'pagada' ? 'var(--gris-300)'
                : i.tono === 'vencida' ? 'var(--rojo)'
                  : i.tono === 'hoy' ? '#f59e0b' : 'var(--verde-claro)'}`,
          }),
          `${i.nombreCliente.split(' ')[0]} ${i.numero}`)),
        items.length > 3 ? h('div', { class: 'mini-cuota', style: 'color:var(--gris-500)' },
          `+${items.length - 3} más`) : null);

        return celda;
      }),
    ];

    zonaCalendario.replaceChildren(
      h('div', { class: 'tarjeta' },
        cabeceraMes(),
        h('div', { class: 'tarjeta-cuerpo' },
          h('div', { class: 'calendario' }, ...celdas),
          h('div', { class: 'leyenda', style: 'margin-top:14px' },
            h('span', {}, h('i', { style: 'background:#f59e0b' }), 'Hoy'),
            h('span', {}, h('i', { style: 'background:var(--rojo)' }), 'Vencidas'),
            h('span', {}, h('i', { style: 'background:var(--verde-claro)' }), 'Por cobrar'),
            h('span', {}, h('i', { style: 'background:var(--gris-300)' }), 'Ya pagadas'),
            h('span', { style: 'color:var(--gris-500)' }, 'Toca un día para ver el detalle.')))),
    );

    /* --- Lista de "qué cobro cada día" --- */
    const diasConCuotas = calendario.dias.filter((dia) => (cuotasDelDia.get(dia.fecha) || []).length);

    if (!diasConCuotas.length) {
      zonaContenido.replaceChildren(zonaCalendario, h('div', { class: 'tarjeta', style: 'margin-top:18px' },
        h('div', { class: 'tarjeta-cuerpo' }, vacio(
          `Sin cuotas en ${nombreMes(estado.anio, estado.mes)}`,
          'Con el filtro elegido no hay nada que cobrar este mes.',
        ))));
      return;
    }

    const bloques = diasConCuotas.map((dia) => {
      const items = cuotasDelDia.get(dia.fecha);
      const total = items.filter((i) => i.tono !== 'pagada').reduce((s, i) => s + Number(i.monto), 0);
      const esHoy = dia.fecha === hoy;
      const esPasado = dia.fecha < hoy;

      return h('div', { class: 'tarjeta', id: `dia-${dia.fecha}` },
        h('div', {
          class: `tarjeta-cabecera`,
          style: estado.diaSeleccionada === dia.fecha
            ? 'background:var(--ambar-suave)' : '',
        },
          h('h3', {}, esHoy ? `HOY · ${formatearFecha(dia.fecha)}` : formatearFecha(dia.fecha)),
          h('span', {
            class: `etiqueta ${esHoy ? 'ambar' : esPasado ? 'roja' : 'azul'}`,
          }, esHoy ? 'Cobrar hoy' : esPasado ? 'Atrasado' : 'Programado'),
          h('span', { class: 'crece' }),
          h('span', { class: 'etiqueta verde' }, `Total ${formatearSoles(total)}`)),
        h('div', { class: 'tabla-envoltura' },
          h('table', { class: 'tabla plegable' },
            h('thead', {}, h('tr', {},
              h('th', {}, 'Cliente'),
              h('th', {}, 'Cuota'),
              h('th', { class: 'num' }, 'Monto'),
              h('th', { class: 'num' }, 'Estado'),
              h('th', { class: 'num' }, ''))),
            h('tbody', {}, ...items.map((item) => h('tr', {},
              h('td', { class: 'bloque' }, h('strong', {}, item.nombreCliente)),
              h('td', { datosEtiqueta: 'Cuota' }, `N.° ${item.numero}`),
              h('td', { datosEtiqueta: 'Monto', class: 'num negrita' }, formatearSoles(item.monto)),
              h('td', { datosEtiqueta: 'Estado' },
                h('span', {
                  class: `etiqueta ${{ pagada: 'verde', vencida: 'roja', hoy: 'ambar', futura: 'azul' }[item.tono]}`,
                }, { pagada: 'Pagada', vencida: 'Vencida', hoy: 'Vence hoy', futura: 'Programada' }[item.tono])),
              h('td', {},
                h('div', { style: 'display:flex;gap:6px;justify-content:flex-end' },
                  h('button', {
                    class: 'btn btn-claro btn-pequeno', type: 'button',
                    onclick: () => ir(`prestamos/${item.prestamo_id}`),
                  }, 'Abrir')))))))));
    });

    zonaContenido.replaceChildren(
      zonaCalendario,
      h('h2', { class: 'titulo-seccion', style: 'margin:22px 0 12px' }, 'Qué te toca cobrar cada día'),
      ...bloques,
    );

    // Si Entramos desde el calendario, bajamos hasta el día elegido
    if (estado.diaSeleccionada) {
      setTimeout(() => {
        document.getElementById(`dia-${estado.diaSeleccionada}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  }

  contenedor.replaceChildren(
    h('div', { class: 'acciones' },
      h('button', {
        class: 'btn btn-primario', type: 'button',
        onclick: async () => {
          const { abrirFormularioPrestamo } = await import('/modales/prestamo-form.js');
          abrirFormularioPrestamo({ alGuardar: pintar });
        },
      }, '+ Nuevo préstamo')),
    zonaInterruptor,
    zonaFiltros,
    zonaContenido,
  );

  await pintar();
  suscribir(() => { pintar().catch(console.error); });
}
