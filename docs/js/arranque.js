/**
 * ============================================================================
 *  ARRANQUE.JS - Paso previo a la aplicacion
 * ============================================================================
 *  Este es el unico punto de entrada de la PWA. Antes de cargar la app hace
 *  dos cosas, en este orden:
 *
 *    1. Carga el motor SQLite compilado a WebAssembly (sql.js).
 *    2. Abre la base de datos de este telefono.
 *
 *  No hay pantalla de acceso: la app se abre directa. Los datos viven dentro
 *  del propio telefono (IndexedDB) y no salen de ahi.
 *
 *  Solo entonces carga app.js, que es practicamente el mismo archivo del
 *  sistema de PC: dibuja los iconos, pide el estado y pinta la primera
 *  pantalla.
 * ============================================================================
 */

import { cargarBase, instalarGuardadoDeSalida } from './datos.js';
import { abrirBaseDatos } from './negocio.js';
import { usuarioActual } from './auth.js';

/** Carga sql-wasm.js y lo deja disponible como window.SQL. */
function cargarMotor() {
  if (window.SQL) return Promise.resolve(window.SQL);
  return new Promise((resolver, rechazar) => {
    const etiqueta = document.createElement('script');
    etiqueta.src = './vendor/sql-wasm.js';
    etiqueta.onload = async () => {
      try {
        const SQL = await globalThis.initSqlJs({
          locateFile: (archivo) => `./vendor/${archivo}`,
        });
        window.SQL = SQL;
        resolver(SQL);
      } catch (error) { rechazar(error); }
    };
    etiqueta.onerror = () => rechazar(new Error('No se pudo cargar el motor de datos.'));
    document.head.appendChild(etiqueta);
  });
}

function mostrarError(mensaje) {
  const pantalla = document.getElementById('pantallaCarga');
  const texto = document.getElementById('textoCarga');
  if (texto) texto.textContent = '';
  pantalla.replaceChildren(
    Object.assign(document.createElement('div'), { className: 'caja-carga' }),
  );
  const caja = pantalla.querySelector('.caja-carga');
  const titulo = document.createElement('h2');
  titulo.textContent = 'No se pudo abrir la aplicacion';
  const parrafo = document.createElement('p');
  parrafo.style.maxWidth = '460px';
  parrafo.textContent = mensaje;
  caja.append(titulo, parrafo);
}

async function arrancar() {
  const textoCarga = document.getElementById('textoCarga');
  try {
    if (textoCarga) textoCarga.textContent = 'Preparando el motor de datos...';
    await cargarMotor();

    // Un solo usuario por telefono. Si la app ya se usaba antes, se respeta
    // el nombre que tenia: asi una actualizacion no deja los datos de lado.
    const usuario = await usuarioActual();

    if (textoCarga) textoCarga.textContent = 'Abriendo tus datos...';
    const bytes = await cargarBase(usuario);
    abrirBaseDatos(bytes, usuario);
    instalarGuardadoDeSalida();

    // La app (app.js) arranca sola al importarla.
    await import('../app.js');
  } catch (error) {
    console.error(error);
    mostrarError((error && error.message) || 'Error inesperado al abrir la aplicacion.');
  }
}

arrancar();
