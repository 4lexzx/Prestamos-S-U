/**
 * ============================================================================
 *  APP.JS - Punto de entrada: navegación y pantalla inicial
 * ============================================================================
 * ============================================================================
 */

import { api } from './api.js';
import { app, ir, limpiarSuscriptores, refrescar, suscribir } from './estado.js';
import { avisar, h, icono } from './ui.js';

import { montarDashboard } from './vistas/dashboard.js';
import { montarCobrar } from './vistas/cobrar.js';
import { montarPrestamos } from './vistas/prestamos.js';
import { montarPrestamo } from './vistas/prestamo.js';
import { montarClientes } from './vistas/clientes.js';
import { montarCliente } from './vistas/cliente.js';
import { montarCapital } from './vistas/capital.js';
import { montarAjustes } from './vistas/ajustes.js';

/* ========================================================================== *
 *  MAPA DE PANTALLAS
 * ========================================================================== */

const RUTAS = [
  { patron: ['dashboard'], vista: montarDashboard, titulo: 'Dashboard', subtitulo: 'Resumen de tu negocio hoy' },
  { patron: ['cobrar'], vista: montarCobrar, titulo: 'A cobrar', subtitulo: 'Qué cobras hoy y qué está atrasado' },
  { patron: ['prestamos'], vista: montarPrestamos, titulo: 'Préstamos', subtitulo: 'Todos tus préstamos' },
  { patron: ['prestamos', 'dia', '#fecha'], vista: montarPrestamos, titulo: 'Préstamos', subtitulo: 'Detalle de un día' },
  { patron: ['prestamos', '#id'], vista: montarPrestamo, titulo: 'Detalle del préstamo', subtitulo: '' },
  { patron: ['clientes'], vista: montarClientes, titulo: 'Clientes', subtitulo: 'Todas las personas que te deben' },
  { patron: ['clientes', '#id'], vista: montarCliente, titulo: 'Historial del cliente', subtitulo: '' },
  { patron: ['capital'], vista: montarCapital, titulo: 'Capital', subtitulo: 'Cuánto tienes y cuánto falta volver' },
  { patron: ['ajustes'], vista: montarAjustes, titulo: 'Ajustes', subtitulo: 'Respaldo, exportación y preferencias' },
];

const SECCION_POR_VISTA = {
  dashboard: 'dashboard', cobrar: 'cobrar', prestamos: 'prestamos',
  clientes: 'clientes', capital: 'capital', ajustes: 'ajustes',
};

/* ========================================================================== *
 *  RENDERIZADO
 * ========================================================================== */

const elementoVista = () => document.getElementById('vista');

/** Limpia la pantalla y marca el enlace del menú que está activo. */
function pintarEsqueleto(titulo, subtitulo, claveMenu) {
  document.getElementById('tituloVista').textContent = titulo;
  document.getElementById('subtituloVista').textContent = subtitulo || '';
  for (const enlace of document.querySelectorAll('#menu a')) {
    enlace.classList.toggle('activo', enlace.dataset.vista === claveMenu);
  }
  elementoVista().replaceChildren();
}

let pintarPantallaActual = () => {};

/** Dibuja la pantalla que corresponde a la dirección del navegador. */
async function pintarRuta() {
  const bruto = location.hash.replace(/^#\/?/, '');
  const partes = bruto.split('/').filter(Boolean);
  app.ruta = partes[0] || 'dashboard';

  // Cierra el menú lateral en celular
  document.getElementById('lateral').classList.remove('abierto');
  document.getElementById('tapa').classList.remove('visible');

  let coincidencias = RUTAS.filter((ruta) => ruta.patron.length === partes.length
    && ruta.patron.every((pieza, i) => pieza === '#id' || pieza.toLowerCase() === (partes[i] || '').toLowerCase()));

  // Si no hay coincidencia exacta, muestra la pantalla principal de esa sección
  if (!coincidencias.length && partes.length) {
    coincidencias = RUTAS.filter((ruta) => ruta.patron.length === 1
      && ruta.patron[0] === (partes[0] || '').toLowerCase());
  }
  const elegida = coincidencias[0] || RUTAS[0];
  const claveMenu = SECCION_POR_VISTA[elegida.vista] || app.ruta;

  pintarEsqueleto(elegida.titulo, elegida.subtitulo, claveMenu);
  elementoVista().classList.add('carga-suave');

  const id = partes[1] && /^\d+$/.test(partes[1]) ? Number(partes[1]) : null;

  try {
    limpiarSuscriptores();
    if (elegida.vista === montarPrestamos && partes[1] === 'dia') {
      await elegida.vista(elementoVista(), { diaSeleccionada: partes[2] });
    } else {
      await elegida.vista(elementoVista(), { id, partes });
    }
  } catch (error) {
    console.error(error);
    elementoVista().replaceChildren(
      hError(error.message, () => pintarRuta()));
  }

  elementoVista().classList.remove('carga-suave');
  elementoVista().scrollIntoView({ block: 'start' });
}

/** Re-dibuja la pantalla actual (usado tras cada cambio de datos). */
function reprogramar() {
  clearTimeout(pintarPantallaActual);
  pintarPantallaActual = setTimeout(() => pintarRuta(), 40);
}

function hError(mensaje, reintentar) {
  return h('div', { class: 'tarjeta' }, h('div', { class: 'tarjeta-cuerpo' },
    h('div', { class: 'vacio-estado' },
      h('div', { class: 'grande' }, icono('alerta', 'rojo')),
      h('h3', {}, 'Algo no salió bien'),
      h('p', {}, mensaje),
      h('button', { class: 'btn btn-primario', type: 'button', onclick: reintentar }, 'Reintentar'))));
}

/* ========================================================================== *
 *  ARRANQUE
 * ========================================================================== */

async function iniciar() {
  const pantallaCarga = document.getElementById('pantallaCarga');
  const textoCarga = document.getElementById('textoCarga');

  // 0) Dibujar los iconos del menú lateral (vienen marcados en el HTML)
  for (const hueco of document.querySelectorAll('[data-icono]')) {
    hueco.replaceChildren(icono(hueco.dataset.icono));
  }

  // 1) Hablar con el servidor local
  try {
    const estado = await api.estado();
    app.ajustes = estado.ajustes;
    app.hoy = estado.hoy;
  } catch (error) {
    textoCarga.innerHTML = '';
    pantallaCarga.replaceChildren(
      Object.assign(document.createElement('div'), { className: 'caja-carga' }),
    );
    const caja = pantallaCarga.querySelector('.caja-carga');
    caja.innerHTML = '';
    const titulo = document.createElement('h2');
    titulo.textContent = 'No se pudo abrir la aplicación';
    const parrafo = document.createElement('p');
    parrafo.style.maxWidth = '460px';
    parrafo.textContent = error.message;
    const pista = document.createElement('p');
    pista.style.fontSize = '13px';
    pista.textContent = 'Solución: recarga la página. Si sigue sin abrir, cierra y vuelve a abrir la aplicación.';
    caja.append(titulo, parrafo, pista);
    return;
  }

  document.getElementById('app').classList.remove('oculto');
  pantallaCarga.remove();

  pintarCabeceraFija();

  window.addEventListener('hashchange', pintarRuta);
  suscribir(refrescarTodoEnPantalla);
  await pintarRuta();
}

/**
 * Refresca la pantalla visible y los mini-resúmenes cuando cambian los datos.
 * Esta es la pieza que hace que todo se actualice "al instante".
 */
async function refrescarTodoEnPantalla() {
  await actualizarMiniResumen();
  reprogramar();
}

/** Datos del menú lateral: capital disponible y a cobrar hoy. */
export async function actualizarMiniResumen() {
  try {
    const datos = await api.dashboard();
    const zona = document.getElementById('miniResumen');
    zona.replaceChildren(
      Object.assign(document.createElement('b'), { textContent: `S/ ${Number(datos.tarjetas.porCobrar).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }),
      Object.assign(document.createElement('span'), { textContent: 'por cobrar en total' }),
      Object.assign(document.createElement('br')),
      Object.assign(document.createElement('span'), {
        textContent: `${datos.tarjetas.cuotasHoy.cantidad} cuota(s) para hoy`,
      }),
    );
  } catch { /* si falla, se deja el resumen anterior */ }
}

function pintarCabeceraFija() {
  document.getElementById('nombreNegocio').textContent = app.ajustes.nombreNegocio || 'Mi negocio';

  const hoy = new Date(`${app.hoy}T00:00:00`);
  document.getElementById('etiquetaFecha').textContent = hoy.toLocaleDateString('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // Menú lateral en celular
  const lateral = document.getElementById('lateral');
  const tapa = document.getElementById('tapa');
  document.getElementById('btnMenu').addEventListener('click', () => {
    lateral.classList.toggle('abierto');
    tapa.classList.toggle('visible');
  });
  tapa.addEventListener('click', () => {
    lateral.classList.remove('abierto');
    tapa.classList.remove('visible');
  });

  // Botones globales
  document.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('[data-accion]');
    if (!boton) return;
    const accion = boton.dataset.accion;
    if (accion === 'nuevo-prestamo') {
      const { abrirFormularioPrestamo } = await import('./modales/prestamo-form.js');
      abrirFormularioPrestamo({ alGuardar: () => { refrescar(); } });
    }
    if (accion === 'refrescar') {
      boton.disabled = true;
      try { await pintarRuta(); await actualizarMiniResumen(); avisar('Datos actualizados.', 'info'); }
      finally { boton.disabled = false; }
    }
  });

  actualizarMiniResumen();
  // Al volver a la app (por ejemplo desde WhatsApp) comprobamos si cambió el día
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) reprogramar();
  });
}

/* Arrancamos */
iniciar();
