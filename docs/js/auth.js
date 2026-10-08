/**
 * ============================================================================
 *  AUTH.JS - Acceso local (no hay servidor: cada quien su clave)
 * ============================================================================
 *  No valida contra internet: guarda en este mismo telefono una lista de
 *  usuarios con el resumen (hash) de su clave. Sirve para que varias
 *  personas puedan usar la app en el mismo navegador y cada una tenga su
 *  propia base de datos separada.
 *
 *  Nada de esto sale del dispositivo: los usuarios viven en IndexedDB y
 *  solo el nombre del activo queda en localStorage, para no volver a
 *  pedir la clave cada vez que abres la aplicacion.
 * ============================================================================
 */

import { kvLeer, kvGuardar } from './datos.js';

const CLAVE_SESION = 'prestamos-su:usuario-activo';
const ALMACEN_USUARIOS = 'usuarios';
const MINIMO_CLAVE = 4;

/* ========================================================================== *
 *  Sesion
 * ========================================================================== */

export function usuarioDeSesion() {
  try { return localStorage.getItem(CLAVE_SESION) || null; } catch { return null; }
}

export function iniciarSesion(nombre) {
  try { localStorage.setItem(CLAVE_SESION, nombre); } catch { /* modo privado */ }
}

export function cerrarSesion() {
  try { localStorage.removeItem(CLAVE_SESION); } catch { /* modo privado */ }
}

/* ========================================================================== *
 *  Resumen de la clave
 * ========================================================================== */

function aHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 de la clave mezclada con la sal del usuario. */
async function resumir(texto) {
  const datos = new TextEncoder().encode(texto);
  if (globalThis.crypto && crypto.subtle && crypto.subtle.digest) {
    return aHex(new Uint8Array(await crypto.subtle.digest('SHA-256', datos)));
  }
  // Respaldo cuando no hay contexto seguro: resumen no criptografico.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const b of datos) {
    h1 = Math.imul(h1 ^ b, 0x01000193);
    h2 = Math.imul(h2 + b, 0x85ebca6b);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

function nuevaSal() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = (Math.random() * 256) | 0;
  return aHex(bytes);
}

/* ========================================================================== *
 *  Usuarios guardados
 * ========================================================================== */

export async function listarUsuarios() {
  const lista = await kvLeer(ALMACEN_USUARIOS, []);
  return Array.isArray(lista) ? lista : [];
}

export function nombresDeUsuarios(usuarios) {
  return usuarios.map((u) => u.nombre);
}

export async function usuarioExiste(nombre) {
  return (await listarUsuarios()).some((u) => u.nombre === nombre);
}

/** Crea la cuenta en este dispositivo. Devuelve el nombre. */
export async function crearUsuario(nombre, clave) {
  const usuarios = await listarUsuarios();
  if (usuarios.some((u) => u.nombre === nombre)) {
    throw new Error('Ese usuario ya existe en este dispositivo.');
  }
  const mezcla = nuevaSal();
  usuarios.push({ nombre, mezcla, resumen: await resumir(mezcla + ':' + clave) });
  await kvGuardar(ALMACEN_USUARIOS, usuarios);
  return nombre;
}

/** Comprueba la clave. Devuelve el nombre si todo cuadra. */
export async function verificarUsuario(nombre, clave) {
  const usuarios = await listarUsuarios();
  const usuario = usuarios.find((u) => u.nombre === nombre);
  if (!usuario) throw new Error('Ese usuario no existe en este dispositivo.');
  const resumen = await resumir(usuario.mezcla + ':' + clave);
  if (resumen !== usuario.resumen) throw new Error('La clave no coincide.');
  return nombre;
}

/** Cambia la clave de un usuario (se valida con la clave anterior). */
export async function cambiarClave(nombre, claveAntigua, claveNueva) {
  const usuarios = await listarUsuarios();
  const indice = usuarios.findIndex((u) => u.nombre === nombre);
  if (indice < 0) throw new Error('Ese usuario no existe en este dispositivo.');
  const actual = usuarios[indice];
  if (await resumir(actual.mezcla + ':' + claveAntigua) !== actual.resumen) {
    throw new Error('La clave actual no coincide.');
  }
  usuarios[indice] = {
    ...actual,
    resumen: await resumir(actual.mezcla + ':' + claveNueva),
  };
  await kvGuardar(ALMACEN_USUARIOS, usuarios);
}

/* ========================================================================== *
 *  Pantalla de acceso
 * ========================================================================== */

/**
 * Devuelve el nombre del usuario que va a usar la aplicacion.
 * Si ya hay sesion abierta, no pregunta nada.
 */
export async function pedirAcceso() {
  const abierto = usuarioDeSesion();
  if (abierto) return abierto;

  const pantalla = document.getElementById('pantallaAcceso');
  const formulario = document.getElementById('accesoForm');
  const campoUsuario = document.getElementById('accesoUsuario');
  const campoClave = document.getElementById('accesoClave');
  const campoRepetir = document.getElementById('accesoClave2');
  const filaRepetir = document.getElementById('accesoRepetir');
  const etiqueta = document.getElementById('accesoEtiqueta');
  const lista = document.getElementById('accesoLista');
  const error = document.getElementById('accesoError');
  const boton = document.getElementById('accesoBoton');
  const nota = document.getElementById('accesoNota');

  const usuarios = await listarUsuarios();
  const nombres = nombresDeUsuarios(usuarios);

  lista.replaceChildren(...nombres.map((nombre) => {
    const opcion = document.createElement('option');
    opcion.value = nombre;
    return opcion;
  }));

  const esNuevo = () => {
    const nombre = campoUsuario.value.trim();
    if (!nombre) return false;
    return !nombres.includes(nombre);
  };

  function sincronizar() {
    const nuevo = esNuevo() || usuarios.length === 0;
    filaRepetir.classList.toggle('oculto', !nuevo);
    boton.textContent = nuevo ? 'Crear mi cuenta' : 'Entrar';
    if (usuarios.length === 0) etiqueta.textContent = 'Este es el primer usuario de este dispositivo.';
    else if (nuevo) etiqueta.textContent = 'Ese nombre todavia no esta en este dispositivo.';
    else etiqueta.textContent = '';
    error.textContent = '';
  }

  // Si solo hay un usuario en el telefono, lo dejamos ya escrito.
  if (nombres.length === 1) campoUsuario.value = nombres[0];

  campoUsuario.addEventListener('input', sincronizar);
  sincronizar();
  nota.textContent = usuarios.length === 0
    ? 'Crea tu usuario y tu clave: todo se guarda solo en este telefono.'
    : `Hay ${usuarios.length} usuario${usuarios.length === 1 ? '' : 's'} en este dispositivo.`;

  pantalla.classList.remove('oculto');
  campoUsuario.focus();

  return new Promise((resolver) => {
    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      error.textContent = '';
      const nombre = campoUsuario.value.trim();
      const clave = campoClave.value;

      if (nombre.length < 2) { error.textContent = 'Escribe tu nombre de usuario.'; return; }
      if (clave.length < MINIMO_CLAVE) {
        error.textContent = `La clave necesita al menos ${MINIMO_CLAVE} caracteres.`;
        return;
      }

      boton.disabled = true;
      try {
        if (esNuevo() || usuarios.length === 0) {
          if (campoRepetir.value !== clave) {
            error.textContent = 'Las claves no coinciden.';
            return;
          }
          await crearUsuario(nombre, clave);
        } else {
          await verificarUsuario(nombre, clave);
        }
        iniciarSesion(nombre);
        pantalla.classList.add('oculto');
        resolver(nombre);
      } catch (fallo) {
        error.textContent = (fallo && fallo.message) || 'No se pudo abrir la sesion.';
      } finally {
        boton.disabled = false;
      }
    });
  });
}
