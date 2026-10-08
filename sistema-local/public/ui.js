/**
 * ============================================================================
 *  UI.JS - Piezas de interfaz reutilizables
 * ============================================================================
 *  Ventanas flotantes, avisos, confirmaciones y el buscador de clientes.
 * ============================================================================
 */

import { formatearSoles, montoATexto } from '/compartido/moneda.js';

/* ========================================================================== *
 *  CREACIÓN DE ELEMENTOS (helper)
 * ========================================================================== */

/**
 * Crea un elemento HTML.
 *   h('div', { class: 'tarjeta' }, h('h2', {}, 'Título'), 'texto suelto')
 *
 * Atributo especial: `datosEtiqueta` escribe data-etiqueta, que en celular
 * se usa como etiqueta a la izquierda de cada celda de las tablas.
 */
export function h(etiqueta, atributos = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos || {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave === 'class') el.className = valor;
    else if (clave === 'html') el.innerHTML = valor;
    else if (clave === 'datosEtiqueta') el.setAttribute('data-etiqueta', valor);
    else if (clave.startsWith('on') && typeof valor === 'function') {
      el.addEventListener(clave.slice(2).toLowerCase(), valor);
    } else if (clave === 'dataset') Object.assign(el.dataset, valor);
    else if (valor === true) el.setAttribute(clave, '');
    else el.setAttribute(clave, valor);
  }
  for (const hijo of hijos.flat(3)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

/** Escapa texto para usarlo dentro de innerHTML. */
export function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/* ========================================================================== *
 *  ICONOS (SVG dibujados, no emojis)
 * ========================================================================== */

/**
 * Cada icono es un dibujo en SVG de 24x24 con trazo, del mismo estilo para
 * que todos se vean iguales en cualquier pantalla. Se usan en vez de emojis
 * porque un emoji cambia de forma segun el celular o el Windows del cliente.
 */
const TRAZOS = {
  panel: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  calendario: 'M7 2v3M17 2v3M3 8h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  diners: 'M2 6h20v12H2zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM5 8v8M19 8v8',
  alerta: 'M12 3 2 20h20L12 3Zm0 6v5m0 3v.5',
  usuarios: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm13 13v-2a4 4 0 0 0-3-3.9M16 4.1a4 4 0 0 1 0 7.8',
  capital: 'M3 3v18h18M7 15l4-5 3 3 5-7M15 6h4v4',
  ajustes: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 8 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H2a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3.7 8a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 8 3.7h.1A1.6 1.6 0 0 0 9 2V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z',
  check: 'M20 6 9 17l-5-5',
  cruz: 'M18 6 6 18M6 6l12 12',
  flecha: 'M19 12H5m7-7-7 7 7 7',
  whatsapp: 'M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3L3 21Z M9 8.5c0 3 2.5 5.5 5.5 5.5.6 0 1-.4 1-1v-.8c-1-.4-1.8-.3-2.1-.1l-1-1c1.6-.6 2.6-1.6 2.6-2.6 0-.3-.3-1.1-1.3-1.1h-.8c-.4 0-.7.1-1 .5l-.8 1c-.2.3-.5.4-.8.2-.3-.2-1.3-.5-2.4-1.4A9 9 0 0 1 6.7 5c.2-.4.6-.5 1-.5h.6c.3 0 .5.2.6.4l.6 1.3c.1.2 0 .4-.1.5l-.4.5c-.1.2-.2.3 0 .6.3.5.9 1.2 1.5 1.6.5.4.8.3 1 .2l.6-.7c.2-.2.4-.2.6-.1l1.2.6c.3.1.4.3.4.5Z',
  descargar: 'M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  guardar: 'M5 3h11l4 4v14H5V3Zm3 0v6h8V3M8 21v-6h8v6',
  tabla: 'M4 3h16v18H4zM4 9h16M4 15h16M10 9v12',
  reloj: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',
  etiqueta: 'M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Zm6-4.5v.5',
  grafico: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  menu: 'M3 6h18M3 12h18M3 18h18',
  mas: 'M12 5v14M5 12h14',
  filtrar: 'M3 5h18l-7 8v6l-4 2v-8L3 5Z',
  nota: 'M6 3h9l4 4v14H6V3Zm9 0v4h4M9 12h6M9 16h6',
};

/**
 * Devuelve un icono SVG listo para insertar en la página.
 *   icono('dinero')            -> icono normal de 20px
 *   icono('alerta', 'rojo')    -> icono de 18px en color rojo
 */
export function icono(nombre, clase = '') {
  const d = TRAZOS[nombre];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `ico-svg ${clase}`.trim());
  svg.style.flex = '0 0 auto';
  const camino = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  camino.setAttribute('d', d || '');
  svg.appendChild(camino);
  return svg;
}

/* ========================================================================== *
 *  AVISOS (mensajes flotantes)
 * ========================================================================== */

export function avisar(mensaje, tipo = 'info') {
  const contenedor = document.getElementById('avisos');
  const aviso = h('div', { class: `aviso ${tipo}` }, mensaje);
  contenedor.append(aviso);
  setTimeout(() => {
    aviso.style.transition = 'opacity .3s';
    aviso.style.opacity = '0';
    setTimeout(() => aviso.remove(), 320);
  }, tipo === 'error' ? 6500 : 3600);
}

/* ========================================================================== *
 *  VENTANA FLOTANTE (modal)
 * ========================================================================== */

/**
 * Abre una ventana flotante.
 * @returns {{elemento, cerrar}} referencia para cerrarla desde el código
 */
export function abrirModal({ titulo, contenido, pie, ancho = '', alCerrar }) {
  const capa = document.getElementById('capaModales');

  const modal = h('div', { class: `modal ${ancho}` },
    h('div', { class: 'modal-cabecera' },
      h('h2', {}, titulo),
h('button', {
          class: 'btn-icono', type: 'button', title: 'Cerrar', 'aria-label': 'Cerrar',
          onclick: () => cerrar(),
        }, icono('cruz', 'chico'))),
    h('div', { class: 'modal-cuerpo' }, contenido),
    pie ? h('div', { class: 'modal-pie' }, pie) : null);

  const fondo = h('div', {
    class: 'modal-fondo',
    onclick: (evento) => { if (evento.target === fondo) cerrar(); },
  }, modal);

  function cerrar() {
    document.removeEventListener('keydown', alPulsarEscape);
    fondo.remove();
    if (alCerrar) alCerrar();
  }

  function alPulsarEscape(evento) {
    if (evento.key === 'Escape') cerrar();
  }

  document.addEventListener('keydown', alPulsarEscape);
  capa.append(fondo);
  setTimeout(() => modal.querySelector('input, select, textarea, button')?.focus(), 60);

  return { elemento: modal, cerrar };
}

/** Confirmación simple. Resuelve a true/false. */
export function confirmar(titulo, mensaje, textoBoton = 'Sí, continuar') {
  return new Promise((resolver) => {
    let respondido = false;
    const responder = (valor) => { if (!respondido) { respondido = true; resolver(valor); } };

    const ventana = abrirModal({
      titulo,
      ancho: 'angosto',
      contenido: h('p', { style: 'margin:0;font-size:15px;color:var(--gris-700)' }, mensaje),
      pie: [
        h('button', {
          class: 'btn btn-claro', type: 'button',
          onclick: () => { responder(false); ventana.cerrar(); },
        }, 'Cancelar'),
        h('button', {
          class: 'btn btn-peligro', type: 'button',
          onclick: () => { responder(true); ventana.cerrar(); },
        }, textoBoton),
      ],
      alCerrar: () => responder(false),
    });
  });
}

/* ========================================================================== *
 *  CAMPOS DE FORMULARIO
 * ========================================================================== */

/** Campo de texto. Devuelve {envoltura, input} */
export function campoTexto({ etiqueta, valor = '', tipo = 'text', obligatorio = false,
  ayuda = '', marcador = '', autocomplete = 'off', alCambiar, id }) {
  const input = h('input', {
    type: tipo, id, value: valor, placeholder: marcador,
    autocomplete, class: tipo === 'number' ? 'monto' : '',
  });
  if (alCambiar) input.addEventListener('input', alCambiar);

  const envoltura = h('div', { class: 'campo' },
    h('label', { for: id }, etiqueta, obligatorio ? h('span', { class: 'obligatorio' }, ' *') : null),
    input,
    ayuda ? h('div', { class: 'ayuda' }, ayuda) : null);

  return { envoltura, input };
}

/** Campo de selección. */
export function campoSelect({ etiqueta, opciones, valor = '', obligatorio = false, ayuda = '', id, alCambiar }) {
  const select = h('select', { id },
    ...opciones.map((op) => h('option', { value: op.valor, selected: op.valor === valor }, op.texto)));
  if (alCambiar) select.addEventListener('change', alCambiar);

  const envoltura = h('div', { class: 'campo' },
    h('label', { for: id }, etiqueta, obligatorio ? h('span', { class: 'obligatorio' }, ' *') : null),
    select,
    ayuda ? h('div', { class: 'ayuda' }, ayuda) : null);

  return { envoltura, select };
}

/** Campo de área de texto. */
export function campoTextoLargo({ etiqueta, valor = '', ayuda = '', id }) {
  const input = h('textarea', { id }, valor);
  const envoltura = h('div', { class: 'campo' },
    h('label', { for: id }, etiqueta), input,
    ayuda ? h('div', { class: 'ayuda' }, ayuda) : null);
  return { envoltura, input };
}

/* ========================================================================== *
 *  BUSCADOR DE CLIENTES
 * ========================================================================== */

/**
 * Selector de clientes con buscador y botón "+ Nuevo cliente".
 *
 * @param {object} opciones
 * @param {function} opciones.cargar      async () => lista de clientes
 * @param {function} opciones.onNuevo     async () => cliente creado (para el botón +)
 * @param {object|null}   opciones.valor   cliente seleccionado inicialmente
 * @returns {{envoltura, obtener, limpiar}} getter del cliente elegido
 */
export function selectorClientes({ cargar, onNuevo, valor = null }) {
  let clientes = [];
  let seleccionado = valor;
  let highlighted = -1;

  const entrada = h('input', {
    type: 'search', placeholder: 'Escribe el nombre del cliente…',
    autocomplete: 'off', id: 'buscadorCliente',
  });
  const cajaResultados = h('div', { class: 'resultados', style: 'display:none' });
  const zonaSeleccionado = h('div', { style: 'display:none' });
  const botonNuevo = h('button', {
    class: 'btn btn-claro', type: 'button', style: 'width:100%;margin-top:8px',
    onclick: async () => {
      const nuevo = await onNuevo();
      if (nuevo) {
        clientes = await cargar();
        seleccionar(nuevo);
        avisar(`Cliente "${nuevo.nombre}" agregado.`, 'exito');
      }
    },
  }, '+ Nuevo cliente');

  const envoltura = h('div', { class: 'campo' },
    h('label', { for: 'buscadorCliente' }, 'Cliente', h('span', { class: 'obligatorio' }, ' *')),
    h('div', { class: 'buscador' }, entrada, cajaResultados),
    zonaSeleccionado,
    botonNuevo);

  function pintarSeleccionado() {
    const hay = Boolean(seleccionado);
    entrada.parentElement.style.display = hay ? 'none' : 'block';
    botonNuevo.style.display = hay ? 'none' : 'block';
    zonaSeleccionado.style.display = hay ? 'block' : 'none';
    if (hay) {
      zonaSeleccionado.replaceChildren(
        h('div', {
          style: 'display:flex;align-items:center;gap:10px;background:var(--verde-suave);'
            + 'padding:10px 13px;border-radius:8px',
        },
        h('div', { class: 'avatar verde' }, iniciales(seleccionado.nombre)),
        h('div', { style: 'flex:1;min-width:0' },
          h('strong', {}, seleccionado.nombre),
          h('small', { style: 'display:block;color:var(--gris-500)' },
            [seleccionado.telefono, seleccionado.dni, seleccionado.ubicacion]
              .filter(Boolean).join(' · ') || 'Sin datos de contacto')),
        h('button', {
          class: 'btn-icono', type: 'button', title: 'Cambiar de cliente',
          onclick: () => { seleccionar(null); entrada.focus(); },
        }, icono('cruz', 'chico'))));
    }
  }

  function filtrar() {
    const texto = entrada.value.trim().toLowerCase();
    highlighted = -1;
    const encontrados = texto
      ? clientes.filter((c) => [c.nombre, c.telefono, c.dni, c.ubicacion]
        .some((campo) => String(campo || '').toLowerCase().includes(texto)))
      : clientes;

    if (!encontrados.length) {
      cajaResultados.replaceChildren(h('div', { class: 'vacio' },
        texto ? 'Ningún cliente coincide con esa búsqueda.'
          : 'Todavía no tienes clientes registrados.'));
      cajaResultados.style.display = 'block';
      return;
    }

    cajaResultados.replaceChildren(...encontrados.slice(0, 60).map((cliente) => h('div', {
      class: 'opcion',
      onclick: () => seleccionar(cliente),
    },
    h('div', {},
      h('strong', {}, cliente.nombre),
      h('small', { style: 'display:block' },
        [cliente.telefono, cliente.dni, cliente.ubicacion].filter(Boolean).join(' · ') || 'Sin contacto')),
    h('span', { class: 'etiqueta gris' }, `#${cliente.id}`))));

    cajaResultados.style.display = 'block';
  }

  function seleccionar(cliente) {
    seleccionado = cliente;
    cajaResultados.style.display = 'none';
    entrada.value = '';
    pintarSeleccionado();
    if (cliente) envoltura.dispatchEvent(new CustomEvent('cliente-elegido', { detail: cliente }));
  }

  function resaltar(indice) {
    const opciones = [...cajaResultados.querySelectorAll('.opcion')];
    if (!opciones.length) return;
    opciones.forEach((o) => o.classList.remove('destacada'));
    highlighted = Math.max(0, Math.min(indice, opciones.length - 1));
    opciones[highlighted].classList.add('destacada');
    opciones[highlighted].scrollIntoView({ block: 'nearest' });
  }

  entrada.addEventListener('input', () => {
    cargar().then((lista) => { clientes = lista; filtrar(); });
  });
  entrada.addEventListener('focus', () => {
    cargar().then((lista) => { clientes = lista; filtrar(); });
  });
  entrada.addEventListener('keydown', (evento) => {
    const opciones = [...cajaResultados.querySelectorAll('.opcion')];
    if (evento.key === 'ArrowDown') { evento.preventDefault(); resaltar(highlighted + 1); }
    if (evento.key === 'ArrowUp') { evento.preventDefault(); resaltar(highlighted - 1); }
    if (evento.key === 'Enter' && opciones[highlighted]) {
      evento.preventDefault();
      seleccionar(clientes.find((c) => c.nombre === opciones[highlighted].querySelector('strong').textContent)
        || clientes[highlighted]);
      highlighted = -1;
    }
    if (evento.key === 'Escape') cajaResultados.style.display = 'none';
  });
  document.addEventListener('click', (evento) => {
    if (!envoltura.contains(evento.target)) cajaResultados.style.display = 'none';
  });

  cargar().then((lista) => { clientes = lista; });
  pintarSeleccionado();

  return {
    envoltura,
    obtener: () => seleccionado,
    seleccionar,
    limpiar: () => seleccionar(null),
  };
}

/* ========================================================================== *
 *  PIEZAS DE PANTALLA
 * ========================================================================== */

export function iniciales(nombre) {
  const partes = String(nombre || '?').trim().split(/\s+/);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?';
}

export function cajaDato(etiqueta, valor, clase = '') {
  return h('div', { class: `dato-caja ${clase}` },
    h('div', { class: 'et' }, etiqueta),
    h('div', { class: 'vl mono-num' }, valor));
}

/** Estado vacío con mensaje y botón opcional. */
export function vacio(titulo, mensaje, textoBoton, alHacerClic) {
    return h('div', { class: 'vacio-estado' },
      h('div', { class: 'grande' }, icono('etiqueta', 'gris')),
    h('h3', {}, titulo),
    h('p', {}, mensaje),
    textoBoton ? h('button', {
      class: 'btn btn-primario', type: 'button', onclick: alHacerClic,
    }, textoBoton) : null);
}

/** Barra que muestra el reparto interés / capital. */
export function barraDesglose(interes, capital) {
  const totalC = Math.max(0.01, Number(interes) + Number(capital));
  const pctInteres = (Number(interes) / totalC) * 100;
  return h('div', {},
    h('div', { class: 'barra-desglose' },
      h('div', { class: 'parte-interes', style: `width:${pctInteres}%` }),
      h('div', { class: 'parte-capital', style: `width:${100 - pctInteres}%` })),
    h('div', { class: 'leyenda' },
      h('span', {},
        h('i', { style: 'background:var(--ambar)' }),
        `Interés (tu ganancia): ${formatearSoles(interes)}`),
      h('span', {},
        h('i', { style: 'background:var(--verde-claro)' }),
        `Capital (recuperas): ${formatearSoles(capital)}`)));
}

/** Barra de progreso de un préstamo. */
export function barraProgreso(texto, porcentaje, color = 'var(--verde-claro)') {
  return h('div', {},
    h('div', {
      style: 'display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px',
    },
    h('span', { style: 'font-weight:600' }, texto),
    h('span', { style: 'color:var(--gris-500)' }, `${porcentaje}%`)),
    h('div', { class: 'progreso' },
      h('div', { style: `width:${porcentaje}%;background:${color}` })));
}

export { formatearSoles, montoATexto };

/* ========================================================================== *
 *  WHATSAPP
 * ========================================================================== */

/**
 * Normaliza un teléfono peruano al formato que necesita WhatsApp: 51 + 9 dígitos.
 * Ej: "987654321" -> "51987654321" | "+51 987 654 321" -> "51987654321"
 */
export function numeroWhatsapp(telefono) {
  let digitos = String(telefono || '').replace(/\D/g, '');
  if (digitos.startsWith('51') && digitos.length > 11) digitos = digitos.slice(2);
  if (digitos.length < 9) return '';
  return `51${digitos.slice(-9)}`;
}

/**
 * Arma el texto del recordatorio de una cuota.
 * @param {object} datos  { nombreNegocio, cliente, numeroCuota, cuotasTotal, fecha,
 *                           monto, interes, capital, frecuencia, saldo }
 */
export function mensajeRecordatorio(datos) {
  const negocio = datos.nombreNegocio ? datos.nombreNegocio : '';
  const saludo = negocio ? `Hola ${datos.cliente}, te escribimos de ${negocio}.` : `Hola ${datos.cliente}.`;
  return [
    saludo,
    '',
    `Te recordamos la cuota N.° ${datos.numeroCuota} de ${datos.cuotasTotal} del préstamo que tienes con nosotros.`,
    `Fecha de pago: ${datos.fecha}`,
    `Monto a pagar: S/ ${Number(datos.monto).toFixed(2)}`,
    `  • Interés: S/ ${Number(datos.interes).toFixed(2)}`,
    `  • Capital: S/ ${Number(datos.capital).toFixed(2)}`,
    datos.saldo ? `Saldo total pendiente: S/ ${Number(datos.saldo).toFixed(2)}` : '',
    '',
    '¡Gracias por tu puntualidad!',
  ].filter((linea) => linea !== null).join('\n');
}

/** Devuelve el enlace de wa.me o null si el cliente no tiene teléfono válido. */
export function enlaceWhatsapp(telefono, mensaje) {
  const numero = numeroWhatsapp(telefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/** Mensaje general de recordatorio de saldo (sin especificar cuota). */
export function mensajeSaldo({ nombreNegocio, cliente, saldo, cuotasVencidas = 0, capitalPendiente }) {
  const saludo = nombreNegocio ? `Hola ${cliente}, te escribimos de ${nombreNegocio}.` : `Hola ${cliente}.`;
  return [
    saludo,
    '',
    `Te recordamos que tienes un saldo pendiente de S/ ${Number(saldo).toFixed(2)}.`,
    capitalPendiente !== undefined ? `De ese monto, S/ ${Number(capitalPendiente).toFixed(2)} es capital y el resto es interés.` : '',
    cuotasVencidas > 0 ? `Tienes ${cuotasVencidas} cuota(s) vencida(s).` : '',
    '',
    '¿Podrías pasar a regularizar? ¡Gracias!',
  ].filter(Boolean).join('\n');
}

/** Botón de WhatsApp listo para usarse. */
export function botonWhatsapp(telefono, mensaje, texto = 'WhatsApp', pequeno = true) {
  const enlace = enlaceWhatsapp(telefono, mensaje);
  if (!enlace) {
    return h('button', {
      class: `btn btn-claro ${pequeno ? 'btn-pequeno' : ''}`,
      type: 'button',
      title: 'Este cliente no tiene teléfono registrado',
      onclick: () => avisar('Este cliente no tiene teléfono registrado. Edítalo para agregarlo.', 'info'),
    }, `${texto} (sin número)`);
  }
return h('a', {
      class: `btn btn-whatsapp ${pequeno ? 'btn-pequeno' : ''}`,
      href: enlace, target: '_blank', rel: 'noopener',
    }, h('span', { class: 'con-icono' }, icono('whatsapp', 'chico'), texto));
}
