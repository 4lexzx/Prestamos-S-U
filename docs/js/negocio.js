/**
 * ============================================================================
 *  NEGOCIO.JS - Reglas de prestamos, cuotas y cobros
 * ============================================================================
 *  GENERADO A PARTIR DE sistema-local/servidor.js. La logica de negocio se
 *  copia sin modificar: son reglas financieras ya probadas en la computadora
 *  y deben dar exactamente los mismos numeros en el celular.
 *
 *  Solo cambia de donde sale la base de datos: ahi donde el servidor usaba
 *  un archivo en disco, aqui se usa SQLite dentro del navegador (sql.js) y
 *  el almacenamiento del propio telefono (IndexedDB).
 * ============================================================================
 */

import { aCentimos, aSoles, redondear2 } from '../compartido/moneda.js';
import {
  calcularDiasTotales, calcularTasaAutomatica, desglosarTasa,
  generarCronograma, resumenPrestamo, repartirAbonos, recalcularPlanConPagos,
  validarCamposPrestamo, validarPrestamo, validarCliente, hoyISO,
  CUOTA_MINIMA,
} from '../compartido/calculo.js';
import { DatabaseSync } from './sqlite.js';
import * as almacen from './datos.js';

/* ========================================================================== *
 *  BASE DE DATOS (en memoria, guardada en el telefono)
 * ========================================================================== */

// La variable db se declara mas abajo (bloque de configuracion), para no
// duplicar la declaracion; aqui solo anadimos el dueño de la base.
let usuarioActivo = null;

/** Carga la base de ese usuario desde el telefono y deja todo listo. */
function abrirBaseDatos(bytes, usuario) {
  db = new DatabaseSync(window.SQL, bytes);
  usuarioActivo = usuario;
  db.exec('PRAGMA foreign_keys = ON;');
  crearEsquema();
  sembrarAjustes();
}

function cerrarBaseDatos() {
  if (!db) return;
  try { db.close(); } catch { /* ya estaba cerrada */ }
  db = null;
}

/** La base activa, para guardarla en el telefono. */
function exportarBase() { return db ? db.exportar() : null; }
function usuarioDeLaBase() { return usuarioActivo; }

const MAXIMO_RESPALDOS = 40;

const AJUSTES_POR_DEFECTO = {
  tasaSemana: '5',
  nombreNegocio: 'Mi negocio',
  pinActivo: '0',
  pinHash: '',
  moneda: 'S/',
};

/* ========================================================================== *
 *  BASE DE DATOS
 * ========================================================================== */

let db = null;

function crearEsquema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ajustes (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre       TEXT    NOT NULL,
      telefono     TEXT    NOT NULL DEFAULT '',
      dni          TEXT    NOT NULL DEFAULT '',
      ubicacion    TEXT    NOT NULL DEFAULT '',
      notas        TEXT    NOT NULL DEFAULT '',
      creado_en    TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prestamos (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id       INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
      monto            REAL    NOT NULL,
      tasa_pct         REAL    NOT NULL,
      tasa_origen      TEXT    NOT NULL DEFAULT 'automatica',
      frecuencia       TEXT    NOT NULL,
      num_cuotas       INTEGER NOT NULL,
      fecha_inicio     TEXT    NOT NULL,
      dias_totales     INTEGER NOT NULL,
      interes_total    REAL    NOT NULL,
      total_pagar      REAL    NOT NULL,
      cuota            REAL    NOT NULL,
      estado           TEXT    NOT NULL DEFAULT 'activo',
      notas            TEXT    NOT NULL DEFAULT '',
      refinanciado_de  INTEGER REFERENCES prestamos(id) ON DELETE SET NULL,
      creado_en        TEXT    NOT NULL,
      cerrado_en       TEXT
    );

    CREATE TABLE IF NOT EXISTS cuotas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      prestamo_id INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
      numero      INTEGER NOT NULL,
      fecha       TEXT    NOT NULL,
      monto       REAL    NOT NULL,
      interes     REAL    NOT NULL,
      capital     REAL    NOT NULL,
      estado      TEXT    NOT NULL DEFAULT 'pendiente',
      fecha_pago  TEXT,
      UNIQUE (prestamo_id, numero)
    );

    CREATE TABLE IF NOT EXISTS abonos (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      prestamo_id  INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
      monto        REAL    NOT NULL,
      fecha        TEXT    NOT NULL,
      cuota_inicio INTEGER NOT NULL DEFAULT 1,
      nota         TEXT    NOT NULL DEFAULT '',
      creado_en    TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS capital_movs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo      TEXT    NOT NULL,
      monto     REAL    NOT NULL,
      fecha     TEXT    NOT NULL,
      nota      TEXT    NOT NULL DEFAULT '',
      creado_en TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refinanciamientos (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      prestamo_origen_id  INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
      prestamo_nuevo_id   INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
      monto_nuevo         REAL    NOT NULL,
      fecha               TEXT    NOT NULL,
      nota                TEXT    NOT NULL DEFAULT '',
      creado_en           TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_prestamos_cliente ON prestamos (cliente_id);
    CREATE INDEX IF NOT EXISTS idx_prestamos_estado  ON prestamos (estado);
    CREATE INDEX IF NOT EXISTS idx_cuotas_prestamo   ON cuotas (prestamo_id);
    CREATE INDEX IF NOT EXISTS idx_cuotas_fecha      ON cuotas (fecha);
    CREATE INDEX IF NOT EXISTS idx_abonos_prestamo   ON abonos (prestamo_id);
  `);
}

function sembrarAjustes() {
  const existe = db.prepare('SELECT COUNT(*) AS n FROM ajustes').get();
  if (existe.n === 0) {
    const insertar = db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?)');
    for (const [clave, valor] of Object.entries(AJUSTES_POR_DEFECTO)) insertar.run(clave, valor);
  }
}

function leerAjuste(clave, porDefecto = '') {
  const fila = db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave);
  return fila ? fila.valor : porDefecto;
}

function leerTodosAjustes() {
  const resultado = { ...AJUSTES_POR_DEFECTO };
  for (const fila of db.prepare('SELECT clave, valor FROM ajustes').all()) {
    resultado[fila.clave] = fila.valor;
  }
  return resultado;
}

function guardarAjuste(clave, valor) {
  db.prepare(`
    INSERT INTO ajustes (clave, valor) VALUES (?, ?)
    ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor
  `).run(String(clave), String(valor));
}

/* ========================================================================== *
 *  RESPALDOS (backup / restore)
 * ========================================================================== */

function marcaTiempo() {
  const ahora = new Date();
  const dosDig = (n) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}${dosDig(ahora.getMonth() + 1)}${dosDig(ahora.getDate())}`
    + `-${dosDig(ahora.getHours())}${dosDig(ahora.getMinutes())}${dosDig(ahora.getSeconds())}`;
}
/* ========================================================================== *
 *  RESPALDOS (aqui: instantaneas en el telefono, no archivos en disco)
 * ========================================================================== */

async function crearRespaldo(motivo = 'manual') {
  const nombre = 'respaldo-' + motivo + '-' + marcaTiempo() + '.db';
  const bytes = exportarBase();
  if (!bytes) throw new Error('No hay base de datos para respaldar.');
  const info = await almacen.guardarRespaldo(usuarioActivo, nombre, bytes);
  await almacen.limpiarRespaldos(usuarioActivo, MAXIMO_RESPALDOS);
  return { nombre: info.nombre, bytes: info.bytes, fecha: hoyISO() };
}

async function listarRespaldos() {
  return almacen.informacionRespaldos(usuarioActivo);
}

async function restaurarRespaldo(nombre) {
  const seguro = String(nombre || '').trim();
  const bytes = await almacen.cargarRespaldo(usuarioActivo, seguro);
  if (!bytes) throw new Error('No se encontro ese respaldo.');

  // Guardamos el estado actual por si algo sale mal
  await crearRespaldo('antes-restaurar');

  db.cargar(bytes);
  db.exec('PRAGMA foreign_keys = ON;');
  crearEsquema();
  sembrarAjustes();
  return { restaurado: seguro };
}

/* ========================================================================== *
 *  CONSULTAS
 * ========================================================================== */

/** Arma el objeto completo de un préstamo (con cuotas, abonos y resumen). */
function obtenerPrestamo(id) {
  const prestamo = db.prepare('SELECT * FROM prestamos WHERE id = ?').get(id);
  if (!prestamo) return null;

  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(prestamo.cliente_id) || null;
  const cuotas = db.prepare('SELECT * FROM cuotas WHERE prestamo_id = ? ORDER BY numero').all(id);
  const abonos = db.prepare('SELECT * FROM abonos WHERE prestamo_id = ? ORDER BY fecha, id').all(id);

  const reparto = repartirAbonos(cuotas, abonos);
  const cuotasConEstado = cuotas.map((cuota) => {
    const info = reparto.get(cuota.numero) || { abonoAplicado: 0, aCobrar: 0, cubiertaPorAbono: false };
    return {
      ...cuota,
      abono_aplicado: info.abonoAplicado,
      a_cobrar: cuota.estado === 'pagada' ? 0 : info.aCobrar,
      cubierta_por_abono: info.cubiertaPorAbono && cuota.estado !== 'pagada',
    };
  });

  const resumen = resumenPrestamo(prestamo, cuotas, abonos);
  const origen = prestamo.refinanciado_de
    ? db.prepare('SELECT id FROM prestamos WHERE id = ?').get(prestamo.refinanciado_de)
    : null;
  const hijos = db.prepare('SELECT id FROM prestamos WHERE refinanciado_de = ?').all(id);

  return {
    ...prestamo,
    cliente,
    cuotas: cuotasConEstado,
    abonos,
    resumen,
    refinanciado_de: origen ? origen.id : null,
    tiene_refinanciamiento: hijos.length > 0,
  };
}

/** Recalcula el estado 'activo'/'terminado' del préstamo según sus cuotas. */
function sincronizarEstadoPrestamo(id) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM cuotas WHERE prestamo_id = ?').get(id).n;
  const pagadas = db.prepare(`
    SELECT COUNT(*) AS n FROM cuotas WHERE prestamo_id = ? AND estado = 'pagada'
  `).get(id).n;

  const terminado = total > 0 && total === pagadas;
  db.prepare('UPDATE prestamos SET estado = ?, cerrado_en = ? WHERE id = ?')
    .run(terminado ? 'terminado' : 'activo', terminado ? hoyISO() : null, id);
  return terminado;
}

/**
 * Marca como pagadas las cuotas que un abono ya cubrió por completo.
 * Devuelve los números de cuota que quedaron cubiertas sin cash de por medio.
 */
function aplicarAbonosAutomaticos(id) {
  const prestamo = db.prepare('SELECT * FROM prestamos WHERE id = ?').get(id);
  if (!prestamo) return [];
  const cuotas = db.prepare('SELECT * FROM cuotas WHERE prestamo_id = ? ORDER BY numero').all(id);
  const abonos = db.prepare('SELECT * FROM abonos WHERE prestamo_id = ? ORDER BY fecha, id').all(id);
  const reparto = repartirAbonos(cuotas, abonos);

  const cubiertas = [];
  for (const cuota of cuotas) {
    const info = reparto.get(cuota.numero);
    if (cuota.estado !== 'pagada' && info?.cubiertaPorAbono) {
      const abono = abonos.find((a) => Number(a.cuota_inicio || 1) <= cuota.numero);
      db.prepare("UPDATE cuotas SET estado = 'pagada', fecha_pago = ? WHERE id = ?")
        .run(abono?.fecha || hoyISO(), cuota.id);
      cubiertas.push(cuota.numero);
    }
  }
  if (cubiertas.length) sincronizarEstadoPrestamo(id);
  return cubiertas;
}

/* ========================================================================== *
 *  LÓGICA DE NEGOCIO
 * ========================================================================== */

function crearCliente(datos) {
  const errores = validarCliente(datos);
  if (errores.length) throw new Error(errores.join(' '));
  const nombre = String(datos.nombre).trim();
  const telefono = String(datos.telefono || '').trim();

  const repetido = db.prepare(`
    SELECT id FROM clientes
    WHERE LOWER(TRIM(nombre)) = LOWER(?) AND TRIM(telefono) = ?
  `).get(nombre, telefono);
  if (repetido) throw new Error('Ya existe un cliente con ese nombre y teléfono.');

  const info = db.prepare(`
    INSERT INTO clientes (nombre, telefono, dni, ubicacion, notas, creado_en)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    nombre,
    telefono,
    String(datos.dni || '').trim(),
    String(datos.ubicacion || '').trim(),
    String(datos.notas || '').trim(),
    new Date().toISOString(),
  );
  return db.prepare('SELECT * FROM clientes WHERE id = ?').get(info.lastInsertRowid);
}

function actualizarCliente(id, datos) {
  const errores = validarCliente(datos);
  if (errores.length) throw new Error(errores.join(' '));
  const nombre = String(datos.nombre).trim();
  const telefono = String(datos.telefono || '').trim();

  const repetido = db.prepare(`
    SELECT id FROM clientes
    WHERE LOWER(TRIM(nombre)) = LOWER(?) AND TRIM(telefono) = ? AND id <> ?
  `).get(nombre, telefono, id);
  if (repetido) throw new Error('Ya existe otro cliente con ese nombre y teléfono.');

  db.prepare(`
    UPDATE clientes SET nombre = ?, telefono = ?, dni = ?, ubicacion = ?, notas = ? WHERE id = ?
  `).run(nombre, telefono, String(datos.dni || '').trim(),
    String(datos.ubicacion || '').trim(), String(datos.notas || '').trim(), id);

  if (!db.prepare('SELECT id FROM clientes WHERE id = ?').get(id)) throw noEncontrado('Cliente no encontrado.');
  return db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
}

function borrarCliente(id) {
  const prestamos = db.prepare('SELECT COUNT(*) AS n FROM prestamos WHERE cliente_id = ?').get(id).n;
  if (prestamos > 0) throw new Error(`No se puede borrar: el cliente tiene ${prestamos} préstamo(s) registrado(s).`);
  const info = db.prepare('DELETE FROM clientes WHERE id = ?').run(id);
  if (info.changes === 0) throw noEncontrado('Cliente no encontrado.');
  return { eliminado: true };
}

/** Prepara (y valida) un préstamo. Sirve para la vista previa y para guardar. */
function prepararPrestamo(datos) {
  const campos = validarCamposPrestamo(datos);
  if (campos.length) throw new Error(campos.join(' '));

  const tasaSemana = Number(leerAjuste('tasaSemana', '5')) || 5;
  const diasTotales = calcularDiasTotales(datos.numCuotas, datos.frecuencia);
  const desglose = desglosarTasa(diasTotales, tasaSemana);

  const tasaEscrita = String(datos.tasaPct ?? '').trim();
  const usarManual = tasaEscrita !== '' && Boolean(datos.usarTasaManual);
  const tasaPct = usarManual ? Number(tasaEscrita) : calcularTasaAutomatica(tasaSemana, diasTotales);

  const errores = validarPrestamo({ ...datos, tasaPct });
  if (errores.length) throw new Error(errores.join(' '));

  const cronograma = generarCronograma({
    monto: datos.monto,
    tasaPct,
    numCuotas: datos.numCuotas,
    frecuencia: datos.frecuencia,
    fechaInicio: datos.fechaInicio,
  });

  if (cronograma.cuota < CUOTA_MINIMA) {
    throw new Error('La cuota quedaría menor a S/ 0.10. Reduce el número de cuotas.');
  }

  return { cronograma, desglose, tasaSemana, tasaManual: usarManual, errores: [] };
}

function crearPrestamo(datos) {
  const { cronograma, tasaManual } = prepararPrestamo(datos);

  const clienteId = Number(datos.clienteId);
  if (!db.prepare('SELECT id FROM clientes WHERE id = ?').get(clienteId)) {
    throw new Error('Selecciona un cliente válido.');
  }

  const activo = db.prepare(
    "SELECT COUNT(*) AS n FROM prestamos WHERE cliente_id = ? AND estado = 'activo'",
  ).get(clienteId).n;

  db.exec('BEGIN');
  try {
    const info = db.prepare(`
      INSERT INTO prestamos (
        cliente_id, monto, tasa_pct, tasa_origen, frecuencia, num_cuotas, fecha_inicio,
        dias_totales, interes_total, total_pagar, cuota, estado, notas, refinanciado_de, creado_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo', ?, ?, ?)
    `).run(
      clienteId, cronograma.monto, cronograma.tasaPct, tasaManual ? 'manual' : 'automatica',
      datos.frecuencia, cronograma.cuotas.length, datos.fechaInicio, cronograma.diasTotales,
      cronograma.interesTotal, cronograma.totalPagar, cronograma.cuota,
      String(datos.notas || '').trim(), datos.refinanciadoDe || null, new Date().toISOString(),
    );
    const id = Number(info.lastInsertRowid);

    const insertarCuota = db.prepare(`
      INSERT INTO cuotas (prestamo_id, numero, fecha, monto, interes, capital, estado)
      VALUES (?, ?, ?, ?, ?, ?, 'pendiente')
    `);
    for (const cuota of cronograma.cuotas) {
      insertarCuota.run(id, cuota.numero, cuota.fecha, cuota.monto, cuota.interes, cuota.capital);
    }

    // Si el cliente ya debe dinero, avisamos (no bloqueamos: es información)
    if (activo > 0) {
      db.prepare('UPDATE prestamos SET notas = ? WHERE id = ?')
        .run(`${String(datos.notas || '').trim()}${String(datos.notas || '').trim() ? ' | ' : ''}`
          + `Tiene ${activo} préstamo(s) activo(s) anterior(es).`.trim(), id);
    }
    db.exec('COMMIT');
    return obtenerPrestamo(id);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Cuotas ya cobradas de un préstamo, en el formato que espera el recálculo. */
function cuotasPagadasDe(id) {
  return db.prepare(
    "SELECT numero, fecha, monto, interes, capital, fecha_pago FROM cuotas "
    + "WHERE prestamo_id = ? AND estado = 'pagada' ORDER BY numero",
  ).all(id).map((cuota) => ({
    numero: cuota.numero,
    fecha: cuota.fecha,
    monto: cuota.monto,
    interes: cuota.interes,
    capital: cuota.capital,
    fechaPago: cuota.fecha_pago,
  }));
}

/**
 * Calcula cómo quedaría el préstamo con los datos nuevos, sin guardarlo.
 * Lo usa el formulario para mostrarle al usuario lo que va a pasar ANTES
 * de confirmar, y `actualizarPrestamo` para hacer el cambio de verdad.
 */
function previsualizarPrestamo(id, datos) {
  const original = db.prepare('SELECT * FROM prestamos WHERE id = ?').get(id);
  if (!original) throw noEncontrado('Préstamo no encontrado.');

  const pagadas = cuotasPagadasDe(id);
  const campos = validarCamposPrestamo(datos);
  if (campos.length) return { ok: false, error: campos.join(' ') };

  const tasaSemana = Number(leerAjuste('tasaSemana', '5')) || 5;
  const tasaEscrita = String(datos.tasaPct ?? '').trim();
  const usarManual = tasaEscrita !== '' && Boolean(datos.usarTasaManual);

  // Sin pagos todavía se puede rehacer el plan entero: es lo más simple y exacto
  if (!pagadas.length) {
    const errores = validarPrestamo({ ...datos, tasaPct: usarManual ? tasaEscrita : '' });
    if (errores.length) return { ok: false, error: errores.join(' ') };
    const { cronograma, desglose, tasaManual } = prepararPrestamo(datos);
    return { ok: true, completo: true, avisos: [], desglose, tasaManual, cronograma };
  }

  const numCuotas = Math.round(Number(datos.numCuotas));
  const diasTotales = calcularDiasTotales(numCuotas, datos.frecuencia);
  const tasaPct = usarManual ? Number(tasaEscrita) : calcularTasaAutomatica(tasaSemana, diasTotales);
  const errores = validarPrestamo({ ...datos, tasaPct });
  if (errores.length) return { ok: false, error: errores.join(' ') };

  const resultado = recalcularPlanConPagos({
    monto: datos.monto,
    tasaPct,
    numCuotas,
    frecuencia: datos.frecuencia,
    fechaInicio: datos.fechaInicio,
    cuotasPagadas: pagadas,
  });
  if (!resultado.ok) return resultado;

  const avisos = [...resultado.avisos];
  const abonos = db.prepare('SELECT COUNT(*) AS n FROM abonos WHERE prestamo_id = ?').get(id).n;
  if (abonos > 0) {
    avisos.push('Este préstamo tiene abonos registrados: se van a repartir de nuevo sobre las cuotas '
      + 'pendientes que resulten de este cambio.');
  }

  return {
    ok: true,
    completo: false,
    avisos,
    pagadas: pagadas.length,
    desglose: desglosarTasa(diasTotales, tasaSemana),
    tasaManual: usarManual,
    cronograma: resultado.cronograma,
  };
}

function actualizarPrestamo(id, datos) {
  const original = db.prepare('SELECT * FROM prestamos WHERE id = ?').get(id);
  if (!original) throw noEncontrado('Préstamo no encontrado.');

  const vistaPrevia = previsualizarPrestamo(id, datos);
  if (!vistaPrevia.ok) throw new Error(vistaPrevia.error);

  const { cronograma } = vistaPrevia;
  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE prestamos SET monto = ?, tasa_pct = ?, tasa_origen = ?, frecuencia = ?, num_cuotas = ?,
        fecha_inicio = ?, dias_totales = ?, interes_total = ?, total_pagar = ?, cuota = ?, notas = ?
      WHERE id = ?
    `).run(
      cronograma.monto, cronograma.tasaPct,
      String(datos.tasaPct ?? '').trim() !== '' && Boolean(datos.usarTasaManual) ? 'manual' : 'automatica',
      datos.frecuencia, cronograma.numCuotas || cronograma.cuotas.length, datos.fechaInicio,
      cronograma.diasTotales, cronograma.interesTotal, cronograma.totalPagar, cronograma.cuota,
      String(datos.notas || '').trim(), id,
    );

    // Solo se rehacen las cuotas que NO están pagadas; el historial queda intacto
    db.prepare('DELETE FROM cuotas WHERE prestamo_id = ? AND estado != ?').run(id, 'pagada');
    const insertarCuota = db.prepare(`
      INSERT INTO cuotas (prestamo_id, numero, fecha, monto, interes, capital, estado, fecha_pago)
      VALUES (?, ?, ?, ?, ?, ?, 'pendiente', NULL)
    `);
    for (const cuota of cronograma.cuotas) {
      if (cuota.estado === 'pagada') continue; // ya está en la base y no se toca
      insertarCuota.run(id, cuota.numero, cuota.fecha, cuota.monto, cuota.interes, cuota.capital);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  aplicarAbonosAutomaticos(id);
  const guardado = obtenerPrestamo(id);
  return { ...guardado, avisos: vistaPrevia.avisos };
}

function borrarPrestamo(id) {
  const prestamo = db.prepare('SELECT * FROM prestamos WHERE id = ?').get(id);
  if (!prestamo) throw noEncontrado('Préstamo no encontrado.');
  const pagadas = db.prepare("SELECT COUNT(*) AS n FROM cuotas WHERE prestamo_id = ? AND estado = 'pagada'")
    .get(id).n;
  if (pagadas > 0) throw new Error('No se puede borrar un préstamo con cuotas pagadas. Deshaz los pagos primero.');

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM cuotas WHERE prestamo_id = ?').run(id);
    db.prepare('DELETE FROM abonos WHERE prestamo_id = ?').run(id);
    db.prepare('DELETE FROM refinanciamientos WHERE prestamo_origen_id = ? OR prestamo_nuevo_id = ?').run(id, id);
    db.prepare('DELETE FROM prestamos WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { eliminado: true };
}

function pagarCuota(prestamoId, numeroCuota) {
  const cuota = db.prepare('SELECT * FROM cuotas WHERE prestamo_id = ? AND numero = ?')
    .get(prestamoId, numeroCuota);
  if (!cuota) throw noEncontrado('Cuota no encontrada.');
  if (cuota.estado === 'pagada') throw new Error('Esa cuota ya está pagada.');
  db.prepare("UPDATE cuotas SET estado = 'pagada', fecha_pago = ? WHERE id = ?")
    .run(hoyISO(), cuota.id);
  sincronizarEstadoPrestamo(prestamoId);
  return obtenerPrestamo(prestamoId);
}

function pagarCuotaConFecha(prestamoId, numeroCuota, fechaPago) {
  const cuota = db.prepare('SELECT * FROM cuotas WHERE prestamo_id = ? AND numero = ?')
    .get(prestamoId, numeroCuota);
  if (!cuota) throw noEncontrado('Cuota no encontrada.');
  if (cuota.estado === 'pagada') throw new Error('Esa cuota ya está pagada.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaPago || ''))) throw new Error('Fecha de pago inválida.');
  db.prepare("UPDATE cuotas SET estado = 'pagada', fecha_pago = ? WHERE id = ?")
    .run(fechaPago, cuota.id);
  sincronizarEstadoPrestamo(prestamoId);
  return obtenerPrestamo(prestamoId);
}

function deshacerCuota(prestamoId, numeroCuota) {
  const cuota = db.prepare('SELECT * FROM cuotas WHERE prestamo_id = ? AND numero = ?')
    .get(prestamoId, numeroCuota);
  if (!cuota) throw noEncontrado('Cuota no encontrada.');
  if (cuota.estado !== 'pagada') throw new Error('Esa cuota ya estaba pendiente.');
  db.prepare("UPDATE cuotas SET estado = 'pendiente', fecha_pago = NULL WHERE id = ?").run(cuota.id);
  sincronizarEstadoPrestamo(prestamoId);
  return obtenerPrestamo(prestamoId);
}

function crearAbono(prestamoId, datos) {
  const montoC = aCentimos(datos.monto);
  if (montoC <= 0) throw new Error('El abono debe ser mayor a S/ 0.00.');
  const prestamo = db.prepare('SELECT * FROM prestamos WHERE id = ?').get(prestamoId);
  if (!prestamo) throw noEncontrado('Préstamo no encontrado.');

  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(datos.fecha || '')) ? datos.fecha : hoyISO();
  const numCuotas = db.prepare('SELECT COUNT(*) AS n FROM cuotas WHERE prestamo_id = ?').get(prestamoId).n;
  const primeraPendiente = db.prepare(`
    SELECT MIN(numero) AS n FROM cuotas WHERE prestamo_id = ? AND estado <> 'pagada'
  `).get(prestamoId).n || numCuotas;

  let inicio = Math.round(Number(datos.cuotaInicio) || primeraPendiente);
  if (inicio < 1 || inicio > numCuotas) throw new Error('La cuota de inicio no existe en este préstamo.');

  // Un abono nunca puede ser mayor a lo que falta cobrar desde su cuota de inicio.
  const detalle = obtenerPrestamo(prestamoId);
  const pendienteDesdeC = detalle.cuotas
    .filter((c) => c.numero >= inicio && c.estado !== 'pagada')
    .reduce((total, c) => total + aCentimos(c.a_cobrar), 0);
  if (montoC > pendienteDesdeC) {
    throw new Error(`El abono no puede ser mayor a lo que falta cobrar desde la cuota ${inicio}: `
      + `máximo ${aSoles(pendienteDesdeC)}.`);
  }

  const info = db.prepare(`
    INSERT INTO abonos (prestamo_id, monto, fecha, cuota_inicio, nota, creado_en)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(prestamoId, aSoles(montoC), fecha, inicio,
    String(datos.nota || '').trim(), new Date().toISOString());

  const cubiertas = aplicarAbonosAutomaticos(prestamoId);
  return { abono: db.prepare('SELECT * FROM abonos WHERE id = ?').get(info.lastInsertRowid), cubiertas, prestamo: obtenerPrestamo(prestamoId) };
}

function borrarAbono(prestamoId, abonoId) {
  const abono = db.prepare('SELECT * FROM abonos WHERE id = ? AND prestamo_id = ?').get(abonoId, prestamoId);
  if (!abono) throw noEncontrado('Abono no encontrado.');
  db.prepare('DELETE FROM abonos WHERE id = ?').run(abonoId);
  return obtenerPrestamo(prestamoId);
}

/**
 * Refinanciar = cerrar el préstamo actual (pagando lo que faltaba como capital)
 * y abrir uno nuevo por el capital pendiente + intereses del nuevo plazo.
 */
function refinanciar(prestamoId, datos) {
  const prestamo = obtenerPrestamo(prestamoId);
  if (!prestamo) throw noEncontrado('Préstamo no encontrado.');
  if (prestamo.resumen.cuotasPagadas >= prestamo.resumen.cuotasTotal) {
    throw new Error('Este préstamo ya está terminado. No se puede refinanciar.');
  }

  const saldoCapital = prestamo.resumen.capitalPendiente;
  const montoC = aCentimos(
    datos.monto !== undefined && datos.monto !== '' ? datos.monto : saldoCapital,
  );
  if (montoC <= 0) throw new Error('El monto del nuevo préstamo debe ser mayor a S/ 0.00.');

  const nuevo = crearPrestamo({
    clienteId: prestamo.cliente_id,
    monto: aSoles(montoC),
    numCuotas: datos.numCuotas,
    frecuencia: datos.frecuencia,
    fechaInicio: datos.fechaInicio,
    tasaPct: datos.tasaPct,
    usarTasaManual: datos.usarTasaManual,
    notas: `Refinanciamiento del préstamo #${prestamoId}. ${String(datos.nota || '').trim()}`.trim(),
  });

  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE prestamos SET estado = 'cerrado_refinanciado', cerrado_en = ?, notas = ?
      WHERE id = ?
    `).run(hoyISO(), `${prestamo.notas} | Refinanciado como préstamo #${nuevo.id}.`.trim(), prestamoId);

    db.prepare(`
      INSERT INTO refinanciamientos (prestamo_origen_id, prestamo_nuevo_id, monto_nuevo, fecha, nota, creado_en)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(prestamoId, nuevo.id, aSoles(montoC), hoyISO(),
      String(datos.nota || '').trim(), new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { origen: obtenerPrestamo(prestamoId), nuevo: obtenerPrestamo(nuevo.id) };
}

/* ========================================================================== *
 *  RESÚMENES: DASHBOARD, CAPITAL, CALENDARIO
 * ========================================================================== */

/** Devuelve la lista completa de préstamos con su resumen ya calculado. */
function listarPrestamos(filtro = 'todos', clienteId = null) {
  const condiciones = [];
  const parametros = [];
  if (clienteId) {
    condiciones.push('p.cliente_id = ?');
    parametros.push(clienteId);
  }
  if (filtro === 'activos') condiciones.push("p.estado = 'activo'");
  if (filtro === 'terminados') condiciones.push("p.estado = 'terminado'");
  if (filtro === 'vencidos') condiciones.push("p.estado = 'activo' AND EXISTS (SELECT 1 FROM cuotas c WHERE c.prestamo_id = p.id AND c.estado <> 'pagada' AND c.fecha < ?)");
  if (filtro === 'cerrados') condiciones.push("p.estado = 'cerrado_refinanciado'");
  if (filtro === 'todos') condiciones.push("p.estado <> 'cerrado_refinanciado'");

  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  if (filtro === 'vencidos') parametros.push(hoyISO());

  const filas = db.prepare(`
    SELECT p.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
    FROM prestamos p JOIN clientes c ON c.id = p.cliente_id
    ${donde}
    ORDER BY p.estado, p.fecha_inicio DESC, p.id DESC
  `).all(...parametros);

  return filas.map((fila) => {
    const cuotas = db.prepare('SELECT * FROM cuotas WHERE prestamo_id = ? ORDER BY numero').all(fila.id);
    const abonos = db.prepare('SELECT * FROM abonos WHERE prestamo_id = ?').all(fila.id);
    return { ...fila, resumen: resumenPrestamo(fila, cuotas, abonos) };
  });
}

function construirDashboard() {
  const prestamos = listarPrestamos('todos');
  const activos = prestamos.filter((p) => p.estado === 'activo');
  const hoy = hoyISO();
  const enSieteDias = new Date(Date.parse(`${hoy}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);

  const sumar = (lista, campo) => aSoles(lista.reduce((total, p) => total + aCentimos(p.resumen[campo]), 0));
  const sumarMonto = (lista) => aSoles(lista.reduce((total, p) => total + aCentimos(p.monto), 0));

  // Cuotas que tocan cobrar, hoy y en los próximos 7 días
  const filas = db.prepare('SELECT * FROM cuotas WHERE estado <> \'pagada\' ORDER BY fecha').all();
  const porPrestamo = new Map(prestamos.map((p) => [p.id, p]));
  const repartoPorPrestamo = new Map();
  for (const p of prestamos) {
    const cuotas = db.prepare('SELECT * FROM cuotas WHERE prestamo_id = ? ORDER BY numero').all(p.id);
    const abonos = db.prepare('SELECT * FROM abonos WHERE prestamo_id = ?').all(p.id);
    repartoPorPrestamo.set(p.id, repartirAbonos(cuotas, abonos));
  }

  const deHoy = [];
  const deSemana = [];
  const vencidas = [];
  for (const cuota of filas) {
    const prestamo = porPrestamo.get(cuota.prestamo_id);
    if (!prestamo || prestamo.estado !== 'activo') continue;
    const info = repartoPorPrestamo.get(cuota.prestamo_id)?.get(cuota.numero);
    const aCobrar = info ? Number(info.aCobrar) : Number(cuota.monto);
    if (aCobrar <= 0) continue;

    const item = {
      prestamoId: cuota.prestamo_id,
      numero: cuota.numero,
      fecha: cuota.fecha,
      monto: redondear2(aCobrar),
      montoCuota: cuota.monto,
      interes: cuota.interes,
      capital: cuota.capital,
      cliente: prestamo.cliente_nombre,
      telefono: prestamo.cliente_telefono,
      frecuencia: prestamo.frecuencia,
    };
    if (cuota.fecha < hoy) vencidas.push(item);
    else if (cuota.fecha === hoy) deHoy.push(item);
    else if (cuota.fecha <= enSieteDias) deSemana.push(item);
  }

  const totalMonto = (lista) => aSoles(lista.reduce((t, i) => t + aCentimos(i.monto), 0));

  return {
    hoy,
    tarjetas: {
      totalPrestado: sumarMonto(activos),
      capitalRecuperado: sumar(prestamos, 'capitalRecuperado'),
      interesGanado: sumar(prestamos, 'interesCobrado'),
      porCobrar: sumar(activos, 'pendiente'),
      interesPorCobrar: sumar(activos, 'interesPorCobrar'),
      capitalPendiente: sumar(activos, 'capitalPendiente'),
      clientesActivos: new Set(activos.map((p) => p.cliente_id)).size,
      totalClientes: db.prepare('SELECT COUNT(*) AS n FROM clientes').get().n,
      prestamosActivos: activos.length,
      prestamosTerminados: prestamos.filter((p) => p.estado === 'terminado').length,
      cuotasHoy: { cantidad: deHoy.length, monto: totalMonto(deHoy) },
      cuotasSemana: { cantidad: deSemana.length, monto: totalMonto(deSemana) },
      cuotasVencidas: { cantidad: vencidas.length, monto: totalMonto(vencidas) },
    },
    aCobrarHoy: deHoy,
    aCobrarSemana: deSemana,
    vencidas,
    proximosVencimientos: [...deHoy, ...deSemana].slice(0, 12),
  };
}

function construirResumenCapital() {
  const movimientos = db.prepare('SELECT * FROM capital_movs ORDER BY fecha, id').all();
  const capitalTotal = aSoles(movimientos.reduce((t, m) => t + aCentimos(m.monto), 0));
  const prestamos = listarPrestamos('todos');
  const activos = prestamos.filter((p) => p.estado === 'activo');

  const prestadoC = activos.reduce((t, p) => t + aCentimos(p.monto), 0);
  const recuperadoC = activos.reduce((t, p) => t + aCentimos(p.resumen.capitalRecuperado), 0);
  const capitalDisponibleC = Math.max(0, aCentimos(capitalTotal) - prestadoC);

  // Desglose por cliente: solo el capital que le falta devolver
  const porCliente = new Map();
  for (const prestamo of activos) {
    const actual = porCliente.get(prestamo.cliente_id) || {
      clienteId: prestamo.cliente_id,
      cliente: prestamo.cliente_nombre,
      telefono: prestamo.cliente_telefono,
      prestamos: 0,
      prestadoC: 0,
      recuperadoC: 0,
      pendienteC: 0,
      porCobrarC: 0,
      interesCobradoC: 0,
      interesPorCobrarC: 0,
      cuotasVencidas: 0,
    };
    actual.prestamos += 1;
    actual.prestadoC += aCentimos(prestamo.monto);
    actual.recuperadoC += aCentimos(prestamo.resumen.capitalRecuperado);
    actual.pendienteC += aCentimos(prestamo.resumen.capitalPendiente);
    actual.porCobrarC += aCentimos(prestamo.resumen.pendiente);
    actual.interesCobradoC += aCentimos(prestamo.resumen.interesCobrado);
    actual.interesPorCobrarC += aCentimos(prestamo.resumen.interesPorCobrar);
    actual.cuotasVencidas += prestamo.resumen.cuotasVencidas;
    porCliente.set(prestamo.cliente_id, actual);
  }

  return {
    capitalTotal,
    movimientos,
    capitalPrestado: aSoles(prestadoC),
    capitalRecuperado: aSoles(recuperadoC),
    capitalDisponible: aSoles(capitalDisponibleC),
    interesGanado: aSoles(activos.reduce((t, p) => t + aCentimos(p.resumen.interesCobrado), 0)),
    interesPorCobrar: aSoles(activos.reduce((t, p) => t + aCentimos(p.resumen.interesPorCobrar), 0)),
    porCobrarTotal: aSoles(activos.reduce((t, p) => t + aCentimos(p.resumen.pendiente), 0)),
    ejemplos: {
      // El ejemplo del manual: S/ 200 en 4 cuotas, pagó 1 -> 3 cuotas, S/ 150 de capital
     demo: activos.slice(0, 1).map((p) => ({
        cliente: p.cliente_nombre,
        prestado: p.monto,
        cuotasPagadas: p.resumen.cuotasPagadas,
        cuotasTotal: p.resumen.cuotasTotal,
        capitalPendiente: p.resumen.capitalPendiente,
      })),
    },
    porCliente: [...porCliente.values()].map((c) => ({
      clienteId: c.clienteId,
      cliente: c.cliente,
      telefono: c.telefono,
      prestamos: c.prestamos,
      prestado: aSoles(c.prestadoC),
      capitalRecuperado: aSoles(c.recuperadoC),
      capitalPendiente: aSoles(c.pendienteC),
      porCobrar: aSoles(c.porCobrarC),
      interesCobrado: aSoles(c.interesCobradoC),
      interesPorCobrar: aSoles(c.interesPorCobrarC),
      cuotasVencidas: c.cuotasVencidas,
    })).sort((a, b) => b.capitalPendiente - a.capitalPendiente),
  };
}

/** Datos para el calendario mensual y la lista "qué cobro cada día". */
function construirCalendario(mes, anio) {
  const primero = `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const ultimo = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  const hoy = hoyISO();

  const prestamos = listarPrestamos('activos');
  const detalle = db.prepare(`
    SELECT c.*, p.cliente_id, p.frecuencia, p.estado AS prestamo_estado, p.cuota, p.monto AS prestamo_monto
    FROM cuotas c JOIN prestamos p ON p.id = c.prestamo_id
    WHERE c.fecha BETWEEN ? AND ?
    ORDER BY c.fecha, c.numero
  `).all(primero, ultimo);

  const infoPrestamos = new Map(prestamos.map((p) => [p.id, p]));
  const nombres = new Map(db.prepare('SELECT id, nombre, telefono FROM clientes').all().map((c) => [c.id, c]));

  const cuotas = detalle.map((cuota) => {
    const prestamo = infoPrestamos.get(cuota.prestamo_id);
    const cliente = nombres.get(cuota.cliente_id);
    return {
      ...cuota,
      cliente: cliente?.nombre || 'Cliente eliminado',
      telefono: cliente?.telefono || '',
      frecuencia: cuota.frecuencia,
    };
  });

  const porDia = new Map();
  for (const cuota of cuotas) {
    if (!porDia.has(cuota.fecha)) porDia.set(cuota.fecha, []);
    porDia.get(cuota.fecha).push(cuota);
  }

  const dias = [];
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const fecha = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const items = (porDia.get(fecha) || []).map((c) => ({
      prestamoId: c.prestamo_id,
      numero: c.numero,
      cliente: c.cliente,
      telefono: c.telefono,
      monto: c.monto,
      estado: c.estado,
    }));
    dias.push({
      fecha,
      dia,
      esHoy: fecha === hoy,
      total: aSoles(items.reduce((t, i) => t + aCentimos(i.monto), 0)),
      cuotas: items,
    });
  }

  const totalMes = aSoles(dias.reduce((t, d) => t + aCentimos(d.total), 0));
  return { mes, anio, primero, ultimo, hoy, dias, totalMes };
}

/* ========================================================================== *
 *  EXPORTACIÓN CSV
 * ========================================================================== */

function construirCSV() {
  const celda = (valor) => {
    const texto = String(valor ?? '');
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const filas = [];

  filas.push(['CLIENTES']);
  filas.push(['Nombre', 'Teléfono', 'DNI', 'Ubicación', 'Notas']);
  for (const c of db.prepare('SELECT * FROM clientes ORDER BY nombre').all()) {
    filas.push([c.nombre, c.telefono, c.dni, c.ubicacion, c.notas]);
  }

  filas.push([]);
  filas.push(['PRÉSTAMOS']);
  filas.push(['ID', 'Cliente', 'Monto', 'Interés %', 'Frecuencia', 'Cuotas',
    'Inicio', 'Interés total', 'Total a pagar', 'Cuota', 'Estado',
    'Cuotas pagadas', 'Capital recuperado', 'Capital pendiente', 'Interés cobrado', 'Por cobrar']);
  for (const p of listarPrestamos('todos')) {
    filas.push([
      p.id, p.cliente_nombre, p.monto, p.tasa_pct, p.frecuencia, p.num_cuotas,
      p.fecha_inicio, p.interes_total, p.total_pagar, p.cuota, p.estado,
      p.resumen.cuotasPagadas, p.resumen.capitalRecuperado, p.resumen.capitalPendiente,
      p.resumen.interesCobrado, p.resumen.pendiente,
    ]);
  }

  filas.push([]);
  filas.push(['CRONOGRAMA DE CUOTAS']);
  filas.push(['Préstamo', 'Cliente', 'Cuota N', 'Fecha', 'Monto', 'Interés', 'Capital', 'Estado', 'Fecha de pago']);
  for (const p of listarPrestamos('todos')) {
    const completo = obtenerPrestamo(p.id);
    for (const cuota of completo.cuotas) {
      filas.push([p.id, p.cliente_nombre, cuota.numero, cuota.fecha, cuota.monto,
        cuota.interes, cuota.capital, cuota.estado, cuota.fecha_pago || '']);
    }
  }

  filas.push([]);
  filas.push(['ABONOS / ADELANTOS']);
  filas.push(['Préstamo', 'Cliente', 'Monto', 'Fecha', 'Aplicado desde cuota', 'Nota']);
  for (const a of db.prepare('SELECT * FROM abonos ORDER BY fecha, id').all()) {
    const p = db.prepare('SELECT cliente_id FROM prestamos WHERE id = ?').get(a.prestamo_id);
    const c = p ? db.prepare('SELECT nombre FROM clientes WHERE id = ?').get(p.cliente_id) : null;
    filas.push([a.prestamo_id, c?.nombre || '', a.monto, a.fecha, a.cuota_inicio, a.nota]);
  }

  filas.push([]);
  filas.push(['CAPITAL']);
  filas.push(['Tipo', 'Monto', 'Fecha', 'Nota']);
  for (const m of db.prepare('SELECT * FROM capital_movs ORDER BY fecha, id').all()) {
    filas.push([m.tipo, m.monto, m.fecha, m.nota]);
  }

  // El punto y coma hace que Excel (Perú) abra cada columna correctamente
  return `﻿${filas.map((f) => f.map(celda).join(';')).join('\r\n')}`;
}

/* ========================================================================== *
 *  SERVIDOR HTTP
 * ========================================================================== */

const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

/* ========================================================================== *
 *  EXPORTACIONES (las usa el enrutador de la PWA)
 * ========================================================================== */

export {
  db as baseDeDatos, abrirBaseDatos, cerrarBaseDatos, exportarBase, usuarioDeLaBase,
  leerAjuste, leerTodosAjustes, guardarAjuste,
  prepararPrestamo, previsualizarPrestamo,
  crearCliente, actualizarCliente, borrarCliente,
  crearPrestamo, actualizarPrestamo, borrarPrestamo, obtenerPrestamo, listarPrestamos,
  pagarCuota, pagarCuotaConFecha, deshacerCuota,
  crearAbono, borrarAbono, refinanciar,
  construirDashboard, construirResumenCapital, construirCalendario, construirCSV,
  crearRespaldo, listarRespaldos, restaurarRespaldo,
};
