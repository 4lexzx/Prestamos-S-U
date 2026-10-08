/**
 * ============================================================================
 *  MONEDA.JS - Utilidades de dinero
 * ============================================================================
 *  Todo el dinero se maneja INTERNAMENTE en CENTIMOS (enteros).
 *
 *  Por que? Porque los decimales de JavaScript fallan:
 *      0.1 + 0.2 === 0.30000000000000004
 *  Si summingos centimos como enteros, los totales cuadran EXACTAMENTE
 *  (nunca "sobran 0.01" ni "faltan 0.01").
 *
 *  Este archivo lo usan TANTO el servidor (Node) como el navegador,
 *  por eso esta escrito en ES Modules sin dependencias del navegador.
 * ============================================================================
 */

export const CENTIMOS_POR_SOL = 100;

/**
 * Convierte cualquier valor (soles, string, vacio) a centimos enteros.
 * Ej: 200 -> 20000   |   "55.50" -> 5550   |   "" -> 0
 */
export function aCentimos(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  // El EPSILON corrige casos como 1.005 que JavaScript guarda como 1.00499...
  return Math.round((numero + Number.EPSILON) * CENTIMOS_POR_SOL);
}

/** Convierte centimos enteros a soles. Ej: 20000 -> 200 */
export function aSoles(centimos) {
  return Math.round(Number(centimos) || 0) / CENTIMOS_POR_SOL;
}

/** Redondea a 2 decimales. Ej: 5.005 -> 5.01 | 2.675 -> 2.68 */
export function redondear2(valor) {
  return aSoles(aCentimos(valor));
}

/**
 * Formatea un monto como moneda peruana: S/ 1,234.50
 * @param {number} valor      Monto en soles
 * @param {boolean} conSimbolo Si false devuelve solo "1,234.50"
 */
export function formatearSoles(valor, conSimbolo = true) {
  const numero = Number(valor) || 0;
  const texto = numero.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return conSimbolo ? `S/ ${texto}` : texto;
}

/** Formatea un porcentaje: 7.14% */
export function formatearPorcentaje(valor, decimales = 2) {
  const numero = Number(valor) || 0;
  return `${numero.toLocaleString('es-PE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })}%`;
}

/**
 * Convierte lo que escribe el usuario en un campo de dinero a centimos.
 * Acepta coma o punto como separador decimal y descarta letras.
 * Ej: "1,200.50" -> 120050 centimos | "s/ 80" -> 8000
 */
export function textoAMonto(valor) {
  if (valor === null || valor === undefined) return 0;
  let texto = String(valor).trim().replace(/[^\d.,-]/g, '');
  const tienePunto = texto.includes('.');
  const tieneComa = texto.includes(',');
  if (tienePunto && tieneComa) {
    // El separador de miles es el ultimo que aparece (estilo peruano)
    if (texto.lastIndexOf(',') > texto.lastIndexOf('.')) {
      texto = texto.replace(/\./g, '').replace(',', '.');
    } else {
      texto = texto.replace(/,/g, '');
    }
  } else if (tieneComa) {
    texto = texto.replace(',', '.');
  }
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

/** Convierte soles a texto editable para los formularios. Ej: 1234.5 -> "1234.50" */
export function montoATexto(valor) {
  return (aSoles(aCentimos(valor))).toFixed(2);
}
