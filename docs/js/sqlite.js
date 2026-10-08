/**
 * ============================================================================
 *  SQLITE.JS - SQLite dentro del navegador, con la misma cara que node:sqlite
 * ============================================================================
 *  La lógica de negocio del sistema local está escrita contra la API
 *  SÍNCRONA de node:sqlite:
 *
 *      db.prepare(sql).get(...params)
 *      db.prepare(sql).all(...params)
 *      db.prepare(sql).run(...params)   -> { changes, lastInsertRowid }
 *      db.exec(sql)                     -> varias sentencias seguidas
 *
 *  sql.js (SQLite compilado a WebAssembly) también es síncrono una vez
 *  cargado, así que este módulo sólo traduce nombres y firmas. De esa forma
 *  la lógica de préstamos, cuotas y abonos se reutiliza SIN REESCRIBIRYA,
 *  que es lo importante: son reglas financieras ya probadas.
 * ============================================================================
 */

/** sql.js devuelve algunas cosas con tipos que node:sqlite no devuelve. */
function normalizarValor(valor) {
  if (typeof valor === 'bigint') return Number(valor);
  if (valor instanceof Uint8Array) return valor;
  return valor;
}

/** Los parámetros llegan sueltos; sql.js espera un arreglo y tipos concretos. */
function normalizarParametros(params) {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (typeof p === 'bigint') return Number(p);
    if (p instanceof Date) return p.toISOString();
    return p;
  });
}

class Sentencia {
  constructor(bd, sql) {
    this._bd = bd;
    this._sql = sql;
  }

  _abrir(params) {
    const stmt = this._bd.prepare(this._sql);
    const limpios = normalizarParametros(params);
    if (limpios.length) stmt.bind(limpios);
    return stmt;
  }

  get(...params) {
    const stmt = this._abrir(params);
    try {
      if (!stmt.step()) return undefined;
      const fila = stmt.getAsObject();
      const salida = {};
      for (const clave of Object.keys(fila)) salida[clave] = normalizarValor(fila[clave]);
      return salida;
    } finally {
      try { stmt.free(); } catch { /* ya liberada */ }
    }
  }

  all(...params) {
    const stmt = this._abrir(params);
    const filas = [];
    try {
      while (stmt.step()) {
        const fila = stmt.getAsObject();
        const salida = {};
        for (const clave of Object.keys(fila)) salida[clave] = normalizarValor(fila[clave]);
        filas.push(salida);
      }
      return filas;
    } finally {
      try { stmt.free(); } catch { /* ya liberada */ }
    }
  }

  run(...params) {
    const stmt = this._abrir(params);
    try {
      stmt.step();
    } finally {
      try { stmt.free(); } catch { /* ya liberada */ }
    }
    const cambios = this._bd.getRowsModified();
    const fila = this._bd.exec('SELECT last_insert_rowid() AS id');
    const ultimo = fila.length && fila[0].values.length ? fila[0].values[0][0] : 0;
    return { changes: cambios, lastInsertRowid: normalizarValor(ultimo) };
  }
}

export class DatabaseSync {
  constructor(constructorSqlJs, bytes = null) {
    this._sqlJs = constructorSqlJs;
    this._bd = new constructorSqlJs.Database(bytes || undefined);
    this._cerrada = false;
  }

  prepare(sql) {
    if (this._cerrada) throw new Error('La base de datos está cerrada.');
    return new Sentencia(this._bd, sql);
  }

  /**
   * Ejecuta una o varias sentencias seguidas. Devuelve algo parecido a
   * node:sqlite por si el código quiere leer el resultado, pero la lógica
   * local sólo usa este método para PRAGMA, BEGIN, COMMIT y CREATE TABLE.
   */
  exec(sql) {
    if (this._cerrada) throw new Error('La base de datos está cerrada.');
    const resultados = this._bd.exec(sql);
    return resultados.map((r) => ({
      columns: r.columns,
      rows: r.values.map((v) => {
        const fila = {};
        r.columns.forEach((c, i) => { fila[c] = normalizarValor(v[i]); });
        return fila;
      }),
    }));
  }

  /** Exporta toda la base como bytes para guardarla en el teléfono. */
  exportar() {
    return this._bd.export();
  }

  /** Reemplaza el contenido por otra base (importar respaldo/migración). */
  cargar(bytes) {
    this._bd.close();
    this._bd = new this._sqlJs.Database(bytes);
    this._cerrada = false;
  }

  close() {
    if (this._cerrada) return;
    try { this._bd.close(); } catch { /* ya cerrada */ }
    this._cerrada = true;
  }
}
