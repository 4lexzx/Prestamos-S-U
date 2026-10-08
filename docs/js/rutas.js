/**
 * ============================================================================
 *  RUTAS.JS - Enrutador de la API, sin servidor
 * ============================================================================
 *  Es el mismo manejarAPI de servidor.js, pero en vez de escribir en una
 *  respuesta HTTP devuelve { status, datos }. Asi la interfaz repite las
 *  mismas 30 llamadas de siempre y no hay que tocar ninguna vista.
 * ============================================================================
 */

import { aCentimos, aSoles } from '../compartido/moneda.js';
import { hoyISO } from '../compartido/calculo.js';
// baseDeDatos es la variable "db" de negocio.js; el enlace de modulo es
// "vivo", asi que aqui se ve siempre el estado actual de la base.
import { baseDeDatos as db } from './negocio.js';
import {
  leerTodosAjustes, guardarAjuste,
  prepararPrestamo, previsualizarPrestamo,
  crearCliente, actualizarCliente, borrarCliente,
  crearPrestamo, actualizarPrestamo, borrarPrestamo, obtenerPrestamo, listarPrestamos,
  pagarCuota, pagarCuotaConFecha, deshacerCuota,
  crearAbono, borrarAbono, refinanciar,
  construirDashboard, construirResumenCapital, construirCalendario, construirCSV,
  crearRespaldo, listarRespaldos, restaurarRespaldo,
} from './negocio.js';

export async function manejar(ruta, metodoHTTP, cuerpo) {
  const url = new URL(ruta, 'http://local');
  const metodo = metodoHTTP;
  cuerpo = cuerpo || {};
  // Ej: /api/prestamos/12/cuotas/3/pagar -> segmentos = [prestamos, 12, cuotas, 3, pagar]
  const segmentos = url.pathname.split('/').filter(Boolean).slice(1);
  const recurso = segmentos[0];
  const id = segmentos[1] && /^\d+$/.test(segmentos[1]) ? Number(segmentos[1]) : null;

  /* --- Estado general --- */
  if (recurso === 'estado' && metodo === 'GET') {
    return responderJSON(null, 200, {
      ok: true,
      baseDatos: 'guardada en este dispositivo',
      ajustes: leerTodosAjustes(),
      hoy: hoyISO(),
    });
  }

  /* --- Ajustes --- */
  if (recurso === 'ajustes') {
    if (metodo === 'GET') return responderJSON(null, 200, leerTodosAjustes());
    if (metodo === 'PUT') {
      if (cuerpo.tasaSemana !== undefined) {
        const tasa = Number(cuerpo.tasaSemana);
        if (!Number.isFinite(tasa) || tasa < 0 || tasa > 100) throw new Error('La tasa semanal debe estar entre 0 y 100.');
        guardarAjuste('tasaSemana', String(tasa));
      }
      if (cuerpo.nombreNegocio !== undefined) guardarAjuste('nombreNegocio', String(cuerpo.nombreNegocio).slice(0, 80));
      return responderJSON(null, 200, leerTodosAjustes());
    }
  }

  /* --- Clientes --- */
  if (recurso === 'clientes') {
    if (metodo === 'GET' && id === null) {
      const busqueda = (url.searchParams.get('q') || '').trim();
      const filas = busqueda
        ? db.prepare(`
            SELECT * FROM clientes
            WHERE nombre LIKE ? OR telefono LIKE ? OR dni LIKE ? OR ubicacion LIKE ?
            ORDER BY nombre
          `).all(`%${busqueda}%`, `%${busqueda}%`, `%${busqueda}%`, `%${busqueda}%`)
        : db.prepare('SELECT * FROM clientes ORDER BY nombre').all();
      return responderJSON(null, 200, filas);
    }
    if (metodo === 'GET' && id !== null) {
      const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
      if (!cliente) throw noEncontrado('Cliente no encontrado.');
      return responderJSON(null, 200, { cliente, prestamos: listarPrestamos('todos', id) });
    }
    if (metodo === 'POST' && id === null) return responderJSON(null, 201, crearCliente(cuerpo));
    if (metodo === 'PUT' && id !== null) return responderJSON(null, 200, actualizarCliente(id, cuerpo));
    if (metodo === 'DELETE' && id !== null) return responderJSON(null, 200, borrarCliente(id));
  }

  /* --- Préstamos --- */
  if (recurso === 'prestamos') {
    // Simulación: la usa el formulario para mostrar la vista previa
    if (segmentos[1] === 'simular' && metodo === 'POST') {
      return responderJSON(null, 200, prepararPrestamo(cuerpo));
    }

    if (id === null) {
      if (metodo === 'GET') {
        const filtro = url.searchParams.get('filtro') || 'todos';
        const clienteId = url.searchParams.get('cliente') ? Number(url.searchParams.get('cliente')) : null;
        return responderJSON(null, 200, listarPrestamos(filtro, clienteId));
      }
      if (metodo === 'POST') return responderJSON(null, 201, crearPrestamo(cuerpo));
    }

    if (id !== null) {
      const accion = segmentos[2];
      const subId = segmentos[3] && /^\d+$/.test(segmentos[3]) ? Number(segmentos[3]) : null;

      if (accion === 'cuotas' && subId !== null) {
        const numero = subId;
        const verbo = segmentos[4];
        if (verbo === 'pagar' && metodo === 'POST') {
          return responderJSON(null, 200, cuerpo.fechaPago
            ? pagarCuotaConFecha(id, numero, cuerpo.fechaPago)
            : pagarCuota(id, numero));
        }
        if (verbo === 'deshacer' && metodo === 'POST') {
          return responderJSON(null, 200, deshacerCuota(id, numero));
        }
      }

      if (accion === 'abonos') {
        if (metodo === 'POST') return responderJSON(null, 201, crearAbono(id, cuerpo));
        if (metodo === 'DELETE' && subId !== null) return responderJSON(null, 200, borrarAbono(id, subId));
      }

      if (accion === 'refinanciar' && metodo === 'POST') {
        return responderJSON(null, 201, refinanciar(id, cuerpo));
      }

      // Muestra cómo quedaría el préstamo con los datos nuevos, sin guardar nada
      if (accion === 'simular' && metodo === 'POST') {
        return responderJSON(null, 200, previsualizarPrestamo(id, cuerpo));
      }

      if (metodo === 'GET') {
        const prestamo = obtenerPrestamo(id);
        if (!prestamo) throw noEncontrado('Préstamo no encontrado.');
        return responderJSON(null, 200, prestamo);
      }
      if (metodo === 'PUT') return responderJSON(null, 200, actualizarPrestamo(id, cuerpo));
      if (metodo === 'DELETE') return responderJSON(null, 200, borrarPrestamo(id));
    }
  }

  /* --- Dashboard / Capital / Calendario --- */
  if (recurso === 'dashboard' && metodo === 'GET') return responderJSON(null, 200, construirDashboard());
  if (recurso === 'capital' && metodo === 'GET') return responderJSON(null, 200, construirResumenCapital());

  if (recurso === 'capital' && metodo === 'POST') {
    const montoC = aCentimos(cuerpo.monto);
    if (montoC <= 0) throw new Error('El monto debe ser mayor a S/ 0.00.');
    const vacio = db.prepare('SELECT COUNT(*) AS n FROM capital_movs').get().n === 0;
    const info = db.prepare(`
      INSERT INTO capital_movs (tipo, monto, fecha, nota, creado_en) VALUES (?, ?, ?, ?, ?)
    `).run(
      vacio ? 'inicial' : (cuerpo.tipo === 'inicial' ? 'inicial' : 'extra'),
      aSoles(montoC),
      /^\d{4}-\d{2}-\d{2}$/.test(String(cuerpo.fecha || '')) ? cuerpo.fecha : hoyISO(),
      String(cuerpo.nota || '').trim(), new Date().toISOString(),
    );
    return responderJSON(null, 201, db.prepare('SELECT * FROM capital_movs WHERE id = ?').get(info.lastInsertRowid));
  }

  if (recurso === 'capital' && metodo === 'DELETE' && id !== null) {
    const info = db.prepare('DELETE FROM capital_movs WHERE id = ?').run(id);
    if (!info.changes) throw noEncontrado('Movimiento no encontrado.');
    return responderJSON(null, 200, { eliminado: true });
  }

  if (recurso === 'calendario' && metodo === 'GET') {
    const ahora = new Date();
    const mes = Number(url.searchParams.get('mes') ?? ahora.getMonth());
    const anio = Number(url.searchParams.get('anio') ?? ahora.getFullYear());
    if (!Number.isInteger(mes) || mes < 0 || mes > 11) throw new Error('Mes inválido.');
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new Error('Año inválido.');
    return responderJSON(null, 200, construirCalendario(mes, anio));
  }

  /* --- Respaldos --- */
  if (recurso === 'respaldos') {
    if (metodo === 'GET') return responderJSON(null, 200, await listarRespaldos());
    if (segmentos[1] === 'restaurar' && metodo === 'POST') {
      return responderJSON(null, 200, await restaurarRespaldo(cuerpo.nombre));
    }
    if (id === null && metodo === 'POST') return responderJSON(null, 201, await crearRespaldo('manual'));
  }

  /* --- Exportación a Excel/CSV --- */
  if (recurso === 'exportar') {
    if (segmentos[1] === 'guardar' && metodo === 'POST') {
      const nombre = 'prestamos-' + hoyISO() + '.csv';
      return responderJSON(null, 201, { nombre, csv: construirCSV() });
    }
    if (metodo === 'GET') {
      const nombre = 'prestamos-' + hoyISO() + '.csv';
      return responderJSON(null, 200, { csv: construirCSV(), nombre });
    }
  }

  return responderJSON(null, 404, { error: 'Ruta no encontrada.' });
}

/** Devuelve { status, datos } en lugar de escribir en una respuesta HTTP. */
function responderJSON(_res, codigo, datos) {
  return { status: codigo, datos };
}

/** Error de "no existe": la app lo muestra igual, pero el codigo sale 404. */
function noEncontrado(mensaje) {
  return Object.assign(new Error(mensaje), { status: 404 });
}

