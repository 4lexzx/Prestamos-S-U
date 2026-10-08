/**
 * ============================================================================
 *  CALCULO.JS - Reglas de negocio del préstamo (núcleo de la app)
 * ============================================================================
 *  REGLA DE INTERÉS DEFINIDA:
 *    1 semana (7 días exactos) = 5% sobre el monto prestado.
 *    2 semanas = 10%  |  3 semanas = 15%  |  4 semanas = 20%  ... y así.
 *    Los días sueltos se prorratean: 10 días = 5% (7 días) + 2.14% (3 días) = 7.14%
 *
 *  MÉTODO DE REPARTO (proporcional):
 *    Total a pagar   = Monto x (1 + tasa%)
 *    Cuota           = Total a pagar / número de cuotas
 *    Interés de cada cuota = Interés total x (cuota / total a pagar)
 *    Capital de cada cuota = Cuota - Interés de esa cuota
 *    => Todos los intereses son iguales y el capital cierra en 0.00 exacto.
 *
 *  Este archivo lo usan TANTO el servidor como el navegador.
 * ============================================================================
 */

import { aCentimos, aSoles } from './moneda.js';

export const DIAS_POR_SEMANA = 7;
export const PASO_DIAS = { diaria: 1, semanal: 7 };
export const NOMBRE_FRECUENCIA = { diaria: 'Diaria', semanal: 'Semanal' };
export const NOMBRE_ESTADO = { activo: 'Activo', terminado: 'Terminado' };

/* ========================================================================== *
 *  FECHAS - se manejan como texto "AAAA-MM-DD" (sin zona horaria, para que
 *  el día nunca cambie por la configuración regional del equipo).
 * ========================================================================== */

/** Suma días a una fecha ISO. Ej: sumarDias('2026-10-04', 7) -> '2026-10-11' */
export function sumarDias(iso, dias) {
  const [anio, mes, dia] = String(iso).split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  fecha.setUTCDate(fecha.getUTCDate() + Number(dias || 0));
  return fecha.toISOString().slice(0, 10);
}

/** Fecha de hoy en ISO, usando la hora LOCAL de la laptop. */
export function hoyISO() {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
}

/** Días que hay entre dos fechas ISO (b - a). Positivo si b es posterior. */
export function diasEntre(isoA, isoB) {
  const a = Date.parse(`${isoA}T00:00:00Z`);
  const b = Date.parse(`${isoB}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** "hace 3 días" / "en 2 días" / "hoy" */
export function textoVencimiento(fecha, referencia = hoyISO()) {
  const dias = diasEntre(referencia, fecha);
  if (dias === 0) return { etiqueta: 'Vence hoy', tono: 'hoy', dias: 0 };
  if (dias === 1) return { etiqueta: 'Vence mañana', tono: 'proxima', dias };
  if (dias > 1) return { etiqueta: `Vence en ${dias} días`, tono: 'futura', dias };
  if (dias === -1) return { etiqueta: '1 día de atraso', tono: 'vencida', dias: 1 };
  return { etiqueta: `${Math.abs(dias)} días de atraso`, tono: 'vencida', dias: Math.abs(dias) };
}

/** Fecha legible: "2026-10-04" -> "04/10/2026" */
export function formatearFecha(iso) {
  if (!iso) return '-';
  const [anio, mes, dia] = String(iso).split('-');
  return `${dia}/${mes}/${anio}`;
}

/** Etiqueta de mes para el calendario: "Octubre 2026" */
export function nombreMes(anio, mes) {
  const nombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${nombres[mes]} ${anio}`;
}

/* ========================================================================== *
 *  TASA DE INTERÉS
 * ========================================================================== */

/** Días que abarca el préstamo: n_cuotas x paso de la frecuencia. */
export function calcularDiasTotales(numCuotas, frecuencia) {
  const paso = pasoFrecuencia(frecuencia);
  return paso * Math.max(1, Math.round(Number(numCuotas) || 1));
}

export function pasoFrecuencia(frecuencia) {
  return PASO_DIAS[frecuencia] || 7;
}

/** Tasa automática = 5% por cada 7 días exactos. */
export function calcularTasaAutomatica(tasaSemana, diasTotales) {
  return (Number(tasaSemana) / DIAS_POR_SEMANA) * Number(diasTotales);
}

/**
 * Descompone la tasa para poder explicarla en pantalla:
 *   10 días con 5% semanal = 7 días (5%) + 3 días (2.14%) = 7.14%
 */
export function desglosarTasa(diasTotales, tasaSemana) {
  const total = Number(diasTotales) || 0;
  const semanas = Math.floor(total / DIAS_POR_SEMANA);
  const diasRestantes = total % DIAS_POR_SEMANA;
  return {
    diasTotales: total,
    semanasCompletas: semanas,
    diasRestantes,
    porcentajeSemanas: semanas * Number(tasaSemana),
    porcentajeDiasRestantes: (diasRestantes * Number(tasaSemana)) / DIAS_POR_SEMANA,
    total: calcularTasaAutomatica(tasaSemana, total),
  };
}

/* ========================================================================== *
 *  CRONOGRAMA DE CUOTAS
 * ========================================================================== */

/**
 * Reparte un total en `cantidad` cuotas sin perder ni un céntimo:
 * la última absorbe la diferencia y el interés de cada cuota sale
 * proporcional a su monto. Es el único lugar donde se decide este reparto,
 * para que un préstamo nuevo y uno editado se comporten exactamente igual.
 *
 * @returns {Array<{montoC:number, interesC:number, capitalC:number}>} en céntimos
 */
function repartirEnCuotas(totalC, interesTotalC, cantidad) {
  const cuotaBaseC = Math.round(totalC / cantidad);
  const partes = [];
  for (let numero = 1; numero <= cantidad; numero += 1) {
    const montoCuotaC = numero === cantidad ? totalC - cuotaBaseC * (cantidad - 1) : cuotaBaseC;
    const interesCuotaC = totalC > 0 ? Math.round((interesTotalC * montoCuotaC) / totalC) : 0;
    partes.push({ montoC: montoCuotaC, interesC: interesCuotaC, capitalC: montoCuotaC - interesCuotaC });
  }
  return partes;
}

/**
 * Genera el cronograma completo de un préstamo.
 * Trabaja 100% en centimos para que los totales cuadren exactos.
 *
 * @param {object} datos
 * @param {number} datos.monto        Monto prestado en soles
 * @param {number} datos.tasaPct      Interest en % (ya sea automático o manual)
 * @param {number} datos.numCuotas    Número de cuotas
 * @param {string} datos.frecuencia   'diaria' | 'semanal'
 * @param {string} datos.fechaInicio  Fecha de la cuota 1
 */
export function generarCronograma({ monto, tasaPct, numCuotas, frecuencia, fechaInicio }) {
  const cantidad = Math.max(1, Math.round(Number(numCuotas) || 1));
  const paso = pasoFrecuencia(frecuencia);
  const diasTotales = paso * cantidad;
  const tasa = Number(tasaPct) || 0;

  const montoC = aCentimos(monto);
  const interesTotalC = Math.round((montoC * tasa) / 100);
  const totalPagarC = montoC + interesTotalC;

  // La cuota se redondea y la ÚLTIMA absorbe la diferencia para cerrar en 0.00
  const cuotaBaseC = Math.round(totalPagarC / cantidad);
  const partes = repartirEnCuotas(totalPagarC, interesTotalC, cantidad);

  const cuotas = [];
  let capitalAcumuladoC = 0;

  for (let numero = 1; numero <= cantidad; numero++) {
    const parte = partes[numero - 1];
    capitalAcumuladoC += parte.capitalC;

    cuotas.push({
      numero,
      fecha: sumarDias(fechaInicio, (numero - 1) * paso),
      monto: aSoles(parte.montoC),
      interes: aSoles(parte.interesC),
      capital: aSoles(parte.capitalC),
      capitalPendiente: aSoles(montoC - capitalAcumuladoC),
      estado: 'pendiente',
      fechaPago: null,
    });
  }

  return {
    diasTotales,
    pasoDias: paso,
    tasaPct: tasa,
    monto: aSoles(montoC),
    interesTotal: aSoles(interesTotalC),
    totalPagar: aSoles(totalPagarC),
    cuota: aSoles(cuotaBaseC),
    cuotas,
  };
}

/* ========================================================================== *
 *  ABONOS / ADELANTOS
 * ==========================================================================
 *  Un abono es dinero extra que el cliente entrega por adelantado.
 *  No se guarda como cuota pagada: se guarda aparte y se reparte (de la más
 *  antigua a la más nueva) cubriendo las cuotas pendientes. Así ninguna cuota
 *  cambia de monto y el historial de pagos queda siempre fiel a la realidad.
 * ========================================================================== */

/**
 * Reparte los abonos sobre las cuotas que siguen pendientes.
 * Un abono indica desde qué cuota se aplica (cuota_inicio), por lo que si el
 * cliente pagó la cuota 2 de contado, el abono empieza a cubrir la 3.
 *
 * @returns {Map<numeroCuota, {abonoAplicado, aCobrar, cubiertaPorAbono}>}
 */
export function repartirAbonos(cuotas, abonos) {
  // Agrupar el dinero de los abonos por la cuota donde empiezan a aplicarse
  const poolPorInicio = new Map();
  for (const abono of abonos || []) {
    const inicio = Math.max(1, Number(abono.cuota_inicio || 1));
    const montoC = aCentimos(abono.monto);
    if (montoC <= 0) continue;
    poolPorInicio.set(inicio, (poolPorInicio.get(inicio) || 0) + montoC);
  }

  let disponibleC = 0;
  const resultado = new Map();

  for (const cuota of [...cuotas].sort((a, b) => a.numero - b.numero)) {
    if (poolPorInicio.has(cuota.numero)) disponibleC += poolPorInicio.get(cuota.numero);

    const montoCuotaC = aCentimos(cuota.monto);
    const estaPagada = cuota.estado === 'pagada';

    if (estaPagada || montoCuotaC === 0) {
      resultado.set(cuota.numero, { abonoAplicado: 0, aCobrar: 0, cubiertaPorAbono: false });
      continue;
    }

    const aplicadoC = Math.min(montoCuotaC, disponibleC);
    disponibleC -= aplicadoC;
    const aCobrarC = montoCuotaC - aplicadoC;

    resultado.set(cuota.numero, {
      abonoAplicado: aSoles(aplicadoC),
      aCobrar: aSoles(aCobrarC),
      cubiertaPorAbono: aCobrarC === 0,
    });
  }

  return resultado;
}

/* ========================================================================== *
 *  EDICIÓN DE UN PRÉSTAMO QUE YA TIENE PAGOS
 * ==========================================================================
 *  Regla de oro: el dinero ya cobrado NO se toca nunca.
 *  Si te equivocaste al teclear el interés, la fecha o el monto, se corrige
 *  sin perder ni falsificar lo que ya te pagaron:
 *
 *    - Cada cuota ya cobrada se conserva tal cual quedó registrada
 *      (monto, fecha de pago e interés son historial, no se alteran).
 *    - El capital que falta por cobrar sale del monto nuevo acordado.
 *    - El interés del plan nuevo se calcula sobre el monto nuevo y se le
 *      descuenta el interés que ya cobraste. Lo que sobra es lo pendiente.
 *
 *  La numeración de las cuotas tampoco se inventa: las pagadas conservan su
 *  número y las pendientes ocupan los números que quedaron libres.
 * ========================================================================== */

/**
 * @param {object}  datos
 * @param {number}  datos.monto        Monto total acordado (puede ser distinto al original)
 * @param {number}  datos.tasaPct      Interés del plan completo, en %
 * @param {number}  datos.numCuotas    Número de cuotas DEL PLAN COMPLETO
 * @param {string}  datos.frecuencia   'diaria' | 'semanal'
 * @param {string}  datos.fechaInicio  Fecha de la cuota 1
 * @param {Array}   datos.cuotasPagadas Cuotas ya cobradas (intocables)
 * @returns {{ok: boolean, error?: string, avisos?: string[], cronograma?: object}}
 */
export function recalcularPlanConPagos({
  monto, tasaPct, numCuotas, frecuencia, fechaInicio, cuotasPagadas,
}) {
  const pagadas = [...(cuotasPagadas || [])].sort((a, b) => a.numero - b.numero);
  const avisos = [];
  const cantidadTotal = Math.max(1, Math.round(Number(numCuotas) || 1));
  const paso = pasoFrecuencia(frecuencia);
  const montoC = aCentimos(monto);
  const tasa = Number(tasaPct) || 0;

  // Cuánto dinero ya entró, separado en capital e interés
  let capitalCobradoC = 0;
  let interesCobradoC = 0;
  for (const cuota of pagadas) {
    capitalCobradoC += aCentimos(cuota.capital);
    interesCobradoC += aCentimos(cuota.interes);
  }

  const capitalRestanteC = montoC - capitalCobradoC;
  if (capitalRestanteC <= 0) {
    return {
      ok: false,
      error: `Ya cobraste S/ ${aSoles(capitalCobradoC)} de capital y el monto nuevo es menor, `
        + 'así que no queda nada por recalcular. Si necesitas cambiar el monto, usa "Refinanciar".',
    };
  }

  const restantes = cantidadTotal - pagadas.length;
  if (restantes < 1) {
    return {
      ok: false,
      error: `Ya cobraste ${pagadas.length} cuota(s), así que el plan debe tener al menos `
        + `${pagadas.length + 1} cuota(s) en total.`,
    };
  }

  // Interés del plan nuevo, menos el que ya se cobró = lo que falta cobrar.
  // Si el plan nuevo daría MENOS interés del que ya entró, se respeta lo cobrado
  // (el cliente no devuelve interés) y no se cobra interest extra de más.
  const interesPlanC = Math.round((montoC * tasa) / 100);
  const interesDelPlanC = Math.max(interesPlanC, interesCobradoC);
  let interesPendienteC = interesDelPlanC - interesCobradoC;
  if (interesPendienteC === 0 && interesPlanC < interesCobradoC) {
    avisos.push(`Cobraste S/ ${aSoles(interesCobradoC)} de interés, pero con el monto y la tasa `
      + `nuevos solo corresponde S/ ${aSoles(interesPlanC)}. Se queda lo que ya cobraste: `
      + 'de aquí en adelante solo se recupera capital.');
  }

  const pendienteTotalC = capitalRestanteC + interesPendienteC;
  const cuotaBaseC = Math.round(pendienteTotalC / restantes);
  if (aSoles(cuotaBaseC) < CUOTA_MINIMA) {
    return { ok: false, error: 'La cuota quedaría menor a S/ 0.10. Reduce el número de cuotas.' };
  }

  // Las pagadas conservan su número, fecha y montos originales
  const cuotas = pagadas.map((cuota) => ({
    numero: cuota.numero,
    fecha: cuota.fecha,
    monto: aSoles(aCentimos(cuota.monto)),
    interes: aSoles(aCentimos(cuota.interes)),
    capital: aSoles(aCentimos(cuota.capital)),
    estado: 'pagada',
    fechaPago: cuota.fechaPago ?? null,
  }));

  // Las pendientes ocupan los números que quedaron libres dentro del plan
  const ocupadas = new Set(pagadas.map((cuota) => cuota.numero));
  const slots = [];
  const mayorNumero = pagadas.reduce((mayor, cuota) => Math.max(mayor, cuota.numero), 0);
  for (let numero = 1; slots.length < restantes && numero <= Math.max(cantidadTotal, mayorNumero); numero += 1) {
    if (!ocupadas.has(numero)) slots.push(numero);
  }
  for (let numero = Math.max(cantidadTotal, mayorNumero) + 1; slots.length < restantes; numero += 1) {
    slots.push(numero);
  }

  const partes = repartirEnCuotas(pendienteTotalC, interesPendienteC, restantes);
  let capitalAcumuladoC = 0;
  for (let i = 0; i < slots.length; i += 1) {
    const numero = slots[i];
    const parte = partes[i];
    capitalAcumuladoC += parte.capitalC;
    cuotas.push({
      numero,
      fecha: sumarDias(fechaInicio, (numero - 1) * paso),
      monto: aSoles(parte.montoC),
      interes: aSoles(parte.interesC),
      capital: aSoles(parte.capitalC),
      capitalPendiente: aSoles(capitalRestanteC - capitalAcumuladoC),
      estado: 'pendiente',
      fechaPago: null,
    });
  }

  // Si la primera pendiente quedó en la misma fecha o antes de la última cobrada, avisamos
  const ultimaPagada = pagadas[pagadas.length - 1];
  const primeraPendiente = cuotas.find((cuota) => cuota.estado === 'pendiente');
  if (primeraPendiente && ultimaPagada && primeraPendiente.fecha <= ultimaPagada.fecha) {
    avisos.push(`La cuota ${primeraPendiente.numero} (${primeraPendiente.fecha}) cae en la misma fecha `
      + `o antes que la última que cobraste (${ultimaPagada.fecha}). Revisa la fecha de inicio.`);
  }
  avisos.push(`Las ${pagadas.length} cuota(s) ya cobrada(s) (S/ ${aSoles(capitalCobradoC + interesCobradoC)}) `
    + 'se quedan exactamente como están; solo se recalcula lo que falta.');

  const totalCuotas = Math.max(cantidadTotal, slots[slots.length - 1]);
  const interesTotalC = interesDelPlanC;
  const totalPagarC = montoC + interesTotalC;
  avisos.push(`El total del préstamo queda en S/ ${aSoles(totalPagarC)}: `
    + `ya cobraste S/ ${aSoles(capitalCobradoC + interesCobradoC)} `
    + `y faltan S/ ${aSoles(totalPagarC - capitalCobradoC - interesCobradoC)}.`);
  cuotas.sort((a, b) => a.numero - b.numero);

  return {
    ok: true,
    avisos,
    cronograma: {
      diasTotales: paso * totalCuotas,
      pasoDias: paso,
      tasaPct: tasa,
      numCuotas: totalCuotas,
      monto: aSoles(montoC),
      interesTotal: aSoles(interesTotalC),
      totalPagar: aSoles(montoC + interesTotalC),
      cuota: aSoles(cuotaBaseC),
      capitalPagado: aSoles(capitalCobradoC),
      interesPagado: aSoles(interesCobradoC),
      capitalRestante: aSoles(capitalRestanteC),
      interesPendiente: aSoles(interesPendienteC),
      pendienteTotal: aSoles(pendienteTotalC),
      cuotas,
    },
  };
}

/* ========================================================================== *
 *  RESUMEN DEL PRÉSTAMO (capital recuperado, interés, saldos)
 * ========================================================================== */

/**
 * Calcula TODO lo que la app muestra de un préstamo en un solo lugar,
 * para que el dashboard, la lista por cliente y el detalle nunca se
 * contradigan: todos leen de esta función.
 */
export function resumenPrestamo(prestamo, cuotas, abonos) {
  const lista = [...cuotas].sort((a, b) => a.numero - b.numero);
  const reparto = repartirAbonos(lista, abonos);

  const montoC = aCentimos(prestamo.monto);
  const interesTotalC = aCentimos(prestamo.interes_total);
  const totalPagarC = aCentimos(prestamo.total_pagar);

  let pagadoCuotasC = 0;      // dinero cobrado por cuotas marcadas como pagadas
  let interesCobradoCuotasC = 0;
  let capitalCobradoCuotasC = 0;
  let cuotasPagadas = 0;
  let aplicadoC = 0;          // parte de los abonos que sí cubrió cuotas
  let vencidas = 0;
  const hoy = hoyISO();

  for (const cuota of lista) {
    const info = reparto.get(cuota.numero) || { abonoAplicado: 0, aCobrar: 0, cubiertaPorAbono: false };
    if (cuota.estado === 'pagada') {
      pagadoCuotasC += aCentimos(cuota.monto);
      interesCobradoCuotasC += aCentimos(cuota.interes);
      capitalCobradoCuotasC += aCentimos(cuota.capital);
      cuotasPagadas += 1;
    } else {
      aplicadoC += aCentimos(info.abonoAplicado);
      if (cuota.fecha < hoy) vencidas += 1;
    }
  }

  const totalAbonosC = (abonos || []).reduce((suma, a) => suma + aCentimos(a.monto), 0);
  const saldoFavorC = Math.max(0, totalAbonosC - aplicadoC);

  // Reparto proporcional del interés dentro de lo recuperado por abonos
  const interesDeAbonosC = totalPagarC > 0 ? Math.round((interesTotalC * aplicadoC) / totalPagarC) : 0;
  const capitalDeAbonosC = aplicadoC - interesDeAbonosC;

  const pendienteC = Math.max(0, totalPagarC - pagadoCuotasC - aplicadoC);
  const interesCobradoC = interesCobradoCuotasC + interesDeAbonosC;
  const capitalRecuperadoC = capitalCobradoCuotasC + capitalDeAbonosC;
  const interesPorCobrarC = Math.max(0, interesTotalC - interesCobradoC);
  const capitalPendienteC = Math.max(0, montoC - capitalRecuperadoC);

  // Desglose de la parte pendiente: interés vs capital de lo que falta cobrar
  const pendienteRelativoC = totalPagarC > 0 ? pendienteC / totalPagarC : 0;
  const interesPendienteCuotasC = Math.round(
    (interesTotalC - interesCobradoCuotasC) * pendienteRelativoC,
  );

  return {
    cuotasTotal: lista.length,
    cuotasPagadas,
    cuotasPendientes: lista.length - cuotasPagadas,
    cuotasVencidas: vencidas,
    cuotasCubiertasPorAbono: lista.filter((c) => c.estado !== 'pagada'
      && (reparto.get(c.numero)?.cubiertaPorAbono)).length,

    pagado: aSoles(pagadoCuotasC),
    pendiente: aSoles(pendienteC),
    saldoFavor: aSoles(saldoFavorC),
    totalAbonos: aSoles(totalAbonosC),

    interesCobrado: aSoles(interesCobradoC),
    interesPorCobrar: aSoles(interesPorCobrarC),
    interesPendienteCuotas: aSoles(interesPendienteCuotasC),

    capitalRecuperado: aSoles(capitalRecuperadoC),
    capitalPendiente: aSoles(capitalPendienteC),

    progreso: lista.length ? Math.round((cuotasPagadas / lista.length) * 100) : 0,
    terminado: lista.length > 0 && cuotasPagadas === lista.length,
  };
}

/* ========================================================================== *
 *  VALIDACIONES
 * ========================================================================== */

export const MONTO_MINIMO = 1;
export const CUOTA_MINIMA = 0.1;

/**
 * Valida solo los datos que escribe el usuario (monto, cuotas, frecuencia y fecha).
 * No mira la tasa porque esa puede calcularla la app automáticamente.
 */
export function validarCamposPrestamo(datos) {
  const errores = [];
  const monto = Number(datos.monto);
  const cuotas = Math.round(Number(datos.numCuotas));

  if (!Number.isFinite(monto) || monto < MONTO_MINIMO) {
    errores.push('El monto prestado debe ser mayor a S/ 0.00.');
  }
  if (!Number.isFinite(cuotas) || cuotas < 1) {
    errores.push('El número de cuotas debe ser 1 o más.');
  } else if (cuotas > 520) {
    errores.push('Máximo 520 cuotas por préstamo.');
  }
  if (!PASO_DIAS[datos.frecuencia]) {
    errores.push('Selecciona una frecuencia válida (diaria o semanal).');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datos.fechaInicio || ''))) {
    errores.push('Selecciona una fecha de inicio válida.');
  }
  return errores;
}

/** Devuelve un array de errores (vacío = todo bien). */
export function validarPrestamo(datos) {
  const errores = validarCamposPrestamo(datos);
  if (errores.length) return errores;

  // La tasa puede llegar vacía (la calcula la app). Solo se valida si el usuario la escribió.
  const tasaTexto = String(datos.tasaPct ?? '').trim();
  if (tasaTexto !== '') {
    const tasa = Number(tasaTexto);
    if (!Number.isFinite(tasa) || tasa < 0) {
      errores.push('El interés no puede ser negativo.');
    } else if (tasa > 1000) {
      errores.push('El interés es demasiado alto (máximo 1000%).');
    } else {
      // Una cuota de menos de 10 céntimos no se puede cobrar en la práctica
      const total = Number(datos.monto) * (1 + tasa / 100);
      if (total / Math.round(Number(datos.numCuotas)) < CUOTA_MINIMA) {
        errores.push('La cuota quedaría menor a S/ 0.10. Reduce el número de cuotas.');
      }
    }
  }
  return errores;
}

export function validarCliente(datos) {
  const errores = [];
  const nombre = String(datos.nombre || '').trim();
  if (nombre.length < 2) errores.push('El nombre del cliente es obligatorio.');
  if (nombre.length > 120) errores.push('El nombre es demasiado largo (máx. 120 letras).');
  if (String(datos.dni || '').trim() && !/^\d{8,12}$/.test(String(datos.dni).trim())) {
    errores.push('El DNI debe tener entre 8 y 12 dígitos.');
  }
  return errores;
}
