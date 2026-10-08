/**
 * ============================================================================
 *  VISTA: CLIENTES
 * ============================================================================
 *  Lista con buscador, edición, borrado y acceso al historial de préstamos.
 *  También exporta el formulario de alta/edición, que se usa desde
 *  "nuevo préstamo" para crear un cliente sin salir de esa pantalla.
 * ============================================================================
 */

import { api } from '../api.js';
import { ir, refrescar } from '../estado.js';
import {
  h, vacio, avisar, confirmar, abrirModal, iniciales, formatearSoles,
} from '../ui.js';

/** Dibuja la lista de clientes. */
export async function montarClientes(contenedor) {
  const estado = { busqueda: '', clientes: [] };

  const buscador = h('input', {
    type: 'search', placeholder: 'Buscar por nombre, teléfono, DNI o ubicación…',
    value: estado.busqueda, style: 'flex:1;min-width:200px',
  });

  const zonaLista = h('div', {});

  async function cargar() {
    estado.clientes = await api.clientes(estado.busqueda);
    pintar();
  }

  async function pintar() {
    if (!estado.clientes.length) {
      zonaLista.replaceChildren(h('div', { class: 'tarjeta' }, h('div', { class: 'tarjeta-cuerpo' },
        vacio(
          estado.busqueda ? 'Ningún cliente coincide' : 'Todavía no tienes clientes',
          estado.busqueda
            ? 'Prueba con otro nombre o borra la búsqueda.'
            : 'Registra a tu primer cliente para poder prestarle.',
          estado.busqueda ? null : '+ Registrar cliente',
          () => abrirFormularioCliente().then((nuevo) => { if (nuevo) cargar(); }),
        ))));
      return;
    }

    // Cuántos préstamos activos tiene cada cliente
    const resumen = await api.prestamos('todos');
    const porCliente = new Map();
    for (const prestamo of resumen) {
      const item = porCliente.get(prestamo.cliente_id) || { activos: 0, total: 0, pendiente: 0 };
      item.total += 1;
      if (prestamo.estado === 'activo') {
        item.activos += 1;
        item.pendiente += Number(prestamo.resumen.pendiente);
      }
      porCliente.set(prestamo.cliente_id, item);
    }

    const filas = estado.clientes.map((cliente) => {
      const info = porCliente.get(cliente.id) || { activos: 0, total: 0, pendiente: 0 };
      return h('tr', {},
        h('td', { class: 'bloque' },
          h('div', { class: 'celda-cliente' },
            h('div', { class: 'avatar' }, iniciales(cliente.nombre)),
            h('div', {},
              h('strong', {}, cliente.nombre),
              h('small', {}, [cliente.telefono, cliente.dni].filter(Boolean).join(' · ') || 'Sin datos de contacto')))),
        h('td', { datosEtiqueta: 'Ubicación' }, cliente.ubicacion || '—'),
        h('td', { datosEtiqueta: 'Préstamos' },
          info.activos
            ? h('span', { class: 'etiqueta verde' }, `${info.activos} activo(s)`)
            : h('span', { class: 'etiqueta gris' }, 'Sin deuda')),
        h('td', { datosEtiqueta: 'Saldo a favor', class: 'num' },
          info.pendiente ? formatearSoles(info.pendiente) : '—'),
        h('td', { datosEtiqueta: 'Acciones' },
          h('div', { style: 'display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap' },
            h('button', {
              class: 'btn btn-claro btn-pequeno', type: 'button',
              onclick: () => ir(`clientes/${cliente.id}`),
            }, 'Historial'),
            h('button', {
              class: 'btn btn-claro btn-pequeno', type: 'button',
              onclick: () => abrirFormularioCliente(cliente).then((nuevo) => { if (nuevo) cargar(); }),
            }, 'Editar'),
            h('button', {
              class: 'btn btn-peligro btn-pequeno', type: 'button',
              onclick: async () => {
                const ok = await confirmar(
                  'Borrar cliente',
                  `¿Seguro que quieres borrar a "${cliente.nombre}"? Esta acción no se puede deshacer.`,
                  'Sí, borrar',
                );
                if (!ok) return;
                try {
                  await api.borrarCliente(cliente.id);
                  avisar('Cliente borrado.', 'exito');
                  refrescar();
                } catch (error) { avisar(error.message, 'error'); }
              },
            }, 'Borrar'))));
    });

    zonaLista.replaceChildren(h('div', { class: 'tarjeta' },
      h('div', { class: 'tarjeta-cabecera' },
        h('h2', {}, 'Clientes'),
        h('span', { class: 'crece' }),
        h('span', { class: 'etiqueta azul' }, `${estado.clientes.length}`)),
      h('div', { class: 'tabla-envoltura' },
        h('table', { class: 'tabla plegable' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Cliente'),
            h('th', {}, 'Ubicación'),
            h('th', {}, 'Préstamos'),
            h('th', { class: 'num' }, 'Saldo pendiente'),
            h('th', { class: 'num' }, 'Acciones'))),
          h('tbody', {}, ...filas)))));
  }

  buscador.addEventListener('input', () => {
    estado.busqueda = buscador.value.trim();
    clearTimeout(buscador.espera);
    buscador.espera = setTimeout(cargar, 250);
  });

  contenedor.replaceChildren(
    h('div', { class: 'acciones' },
      h('div', { class: 'buscador', style: 'flex:1;display:flex;gap:10px' }, buscador,
        h('button', {
          class: 'btn btn-primario', type: 'button', style: 'flex:0 0 auto',
          onclick: () => abrirFormularioCliente().then((nuevo) => { if (nuevo) cargar(); }),
        }, '+ Nuevo cliente'))),
    zonaLista,
  );

  await cargar();
}

/* ========================================================================== *
 *  Formulario de cliente (alta / edición)
 * ========================================================================== */

/**
 * Abre el formulario. Si es alta, muestra el botón "+ Nuevo cliente".
 * @returns {Promise<object|null>} el cliente creado o null si se canceló
 */
export function abrirFormularioCliente(cliente = null) {
  return new Promise((resolver) => {
    const esEdicion = Boolean(cliente);
    let guardado = null; // se llena al guardar; al cerrar la ventana se resuelve

    const nombre = h('input', { type: 'text', placeholder: 'Nombre y apellido', value: cliente?.nombre || '' });
    const telefono = h('input', { type: 'tel', placeholder: '987 654 321', value: cliente?.telefono || '' });
    const dni = h('input', { type: 'text', inputmode: 'numeric', placeholder: '12345678', value: cliente?.dni || '' });
    const ubicacion = h('input', { type: 'text', placeholder: 'Ej. Av. Los Álamos 120, SMP', value: cliente?.ubicacion || '' });
    const notas = h('textarea', { placeholder: 'Nota opcional' }, cliente?.notas || '');

    const zonaError = h('div', {});
    const boton = h('button', { class: 'btn btn-primario', type: 'button' },
      esEdicion ? 'Guardar cambios' : 'Crear cliente');

    boton.addEventListener('click', async () => {
      boton.disabled = true;
      zonaError.replaceChildren();
      const datos = {
        nombre: nombre.value.trim(),
        telefono: telefono.value.trim(),
        dni: dni.value.trim(),
        ubicacion: ubicacion.value.trim(),
        notas: notas.value.trim(),
      };
      try {
        guardado = esEdicion
          ? await api.editarCliente(cliente.id, datos)
          : await api.crearCliente(datos);
        avisar(esEdicion ? 'Cliente actualizado.' : `Cliente "${guardado.nombre}" creado.`, 'exito');
        refrescar();
        ventana.cerrar();
      } catch (error) {
        zonaError.replaceChildren(h('div', { class: 'nota-info roja' }, error.message));
        boton.disabled = false;
      }
    });

    const ventana = abrirModal({
      titulo: esEdicion ? 'Editar cliente' : 'Nuevo cliente',
      contenido: h('div', {},
        h('div', { class: 'campo' },
          h('label', {}, 'Nombre completo', h('span', { class: 'obligatorio' }, ' *')),
          nombre),
        h('div', { class: 'fila-campos' },
          h('div', { class: 'campo' },
            h('label', {}, 'Teléfono'), telefono,
            h('div', { class: 'ayuda' }, 'Se usa para los recordatorios por WhatsApp.')),
          h('div', { class: 'campo' },
            h('label', {}, 'DNI'), dni)),
        h('div', { class: 'campo' },
          h('label', {}, 'Ubicación'), ubicacion),
        h('div', { class: 'campo' },
          h('label', {}, 'Notas'), notas),
        zonaError),
      pie: [
        h('button', {
          class: 'btn btn-claro', type: 'button', onclick: () => ventana.cerrar(),
        }, 'Cancelar'),
        boton,
      ],
      // Se resuelve al cerrar la ventana: con el cliente si se guardó, si no null
      alCerrar: () => resolver(guardado),
    });
  });
}
