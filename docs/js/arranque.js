/**
 * ============================================================================
 *  ARRANQUE.JS - Paso previo a la aplicacion
 * ============================================================================
 *  Este es el unico punto de entrada de la PWA. Antes de cargar la app
 *  hace tres cosas, en este orden:
 *
 *    1. Carga el motor SQLite compilado a WebAssembly (sql.js).
 *    2. Pide el usuario y la clave (o arranca con la sesion ya abierta).
 *    3. Abre la base de ese usuario desde el almacenamiento del telefono.
 *
 *  Solo entonces carga app.js, que es practicamente el mismo archivo del
 *  sistema de PC: dibuja los iconos, pide el estado y pinta la primera
 *  pantalla.
 * ============================================================================
 */

import { cargarBase, instalarGuardadoDeSalida, guardarAhora } from './datos.js';
import { abrirBaseDatos, cerrarBaseDatos, exportarBase, usuarioDeLaBase } from './negocio.js';
import { pedirAcceso, cerrarSesion } from './auth.js';

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

/** Salir de este usuario guardando todo, y volver a la pantalla de acceso. */
async function cambiarDeUsuario() {
  if (!confirm('Cambiar de usuario. Se guardan los cambios de este usuario.')) return;
  try { await guardarAhora(); } catch { /* ya queda guardado al salir */ }
  try { cerrarBaseDatos(); } catch { /* nada que cerrar */ }
  cerrarSesion();
  location.reload();
}

async function arrancar() {
  document.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-accion]');
    if (boton && boton.dataset.accion === 'cambiar-usuario') cambiarDeUsuario();
  });

  const textoCarga = document.getElementById('textoCarga');
  try {
    if (textoCarga) textoCarga.textContent = 'Preparando el motor de datos...';
    await cargarMotor();

    const usuario = await pedirAcceso();

    if (textoCarga) textoCarga.textContent = `Abriendo los datos de ${usuario}...`;
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
