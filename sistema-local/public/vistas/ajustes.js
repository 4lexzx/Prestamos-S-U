/**
 * ============================================================================
 *  VISTA: AJUSTES
 * ============================================================================
 *  - Tabla de interés (5% por semana) editable
 *  - Respaldo de la base de datos con un clic + restaurar
 *  - Exportar a Excel/CSV
 *  - Datos de la aplicación (dónde está la base de datos, etc.)
 * ============================================================================
 */

import { api } from '/api.js';
import { app, refrescar, ir } from '/estado.js';
import {
  h, avisar, confirmar, abrirModal, formatearSoles, icono,
} from '/ui.js';
import { formatearFecha } from '/compartido/calculo.js';

export async function montarAjustes(contenedor) {
  const [ajustes, respaldos, estado] = await Promise.all([
    api.ajustes(), api.respaldos(), api.estado(),
  ]);

  /* ---------------- Interés ---------------- */

  const tasa = h('input', { type: 'text', inputmode: 'decimal', class: 'monto', value: ajustes.tasaSemana });
  const botonTasa = h('button', { class: 'btn btn-primario', type: 'button' }, 'Guardar tasa');

  botonTasa.addEventListener('click', async () => {
    botonTasa.disabled = true;
    try {
      const nuevos = await api.guardarAjustes({ tasaSemana: tasa.value });
      app.ajustes = nuevos;
      avisar(`Tasa guardada: ${nuevos.tasaSemana}% por cada 7 días. `
        + 'Solo afecta a los préstamos NUEVOS.', 'exito');
      refrescar();
    } catch (error) {
      avisar(error.message, 'error');
    } finally {
      botonTasa.disabled = false;
    }
  });

  const montoEjemplo = 200;
  const tasaBase = Number(ajustes.tasaSemana) || 5;

  const filaEjemplo = (plazo, porcentaje, total, cuotas) => h('tr', {},
    h('td', { class: 'negrita' }, plazo),
    h('td', { class: 'num', style: 'color:var(--ambar);font-weight:600' }, porcentaje),
    h('td', { class: 'num' },
      `${formatearSoles(total)} · ${cuotas} cuota(s) de ${formatearSoles(total / cuotas)}`));

  const filasSemanas = [1, 2, 3, 4, 6, 8].map((semanas) => {
    const porcentaje = tasaBase * semanas;
    const total = montoEjemplo * (1 + porcentaje / 100);
    return filaEjemplo(
      `${semanas} semana${semanas > 1 ? 's' : ''} (${semanas * 7} días)`,
      `${porcentaje.toFixed(2)}%`,
      total,
      semanas,
    );
  });

  const filasDias = [10, 21].map((dias) => {
    const porcentaje = (tasaBase * dias) / 7;
    const total = montoEjemplo * (1 + porcentaje / 100);
    const completo = Math.floor(dias / 7);
    const resto = dias % 7;
    const detalle = completo
      ? `${completo} semana(s)${resto ? ` + ${resto} día(s)` : ''}`
      : `${dias} día(s)`;
    return filaEjemplo(
      h('span', {}, `${dias} días`, h('small', { style: 'display:block;color:var(--gris-500)' }, detalle)),
      `${porcentaje.toFixed(2)}%`,
      total,
      dias,
    );
  });

  const tablaInteres = h('table', { class: 'tabla' },
    h('thead', {}, h('tr', {},
      h('th', {}, 'Tiempo del préstamo'),
      h('th', { class: 'num' }, 'Interés'),
      h('th', { class: 'num' }, 'Ejemplo: S/ 200 → total'))),
    h('tbody', {}, ...filasSemanas, ...filasDias));

  const botonNombre = h('button', {
    class: 'btn btn-claro',
    type: 'button',
    onclick: async () => {
      try {
        app.ajustes = await api.guardarAjustes({
          nombreNegocio: document.getElementById('nombreNegocio').value,
        });
        avisar('Nombre guardado.', 'exito');
        refrescar();
      } catch (error) { avisar(error.message, 'error'); }
    },
  }, 'Guardar nombre');

  const tarjetaInteres = h('div', { class: 'tarjeta' },
    h('div', { class: 'tarjeta-cabecera' },
      h('h2', {}, h('span', { class: 'con-icono' }, icono('diners'), 'Tu tabla de interés')),
      h('span', { class: 'crece' }),
      h('span', { class: 'etiqueta verde' }, `Ahora: ${ajustes.tasaSemana}% por semana`)),
    h('div', { class: 'tarjeta-cuerpo' },
      h('div', { class: 'nota-info' },
        'La regla de la app es sencilla: cada 7 días exactos se cobra el porcentaje que pongas aquí. '
        + 'Los días sueltos se prorratean solos.'),
      h('div', { class: 'tabla-envoltura', style: 'margin-bottom:16px' }, tablaInteres),
      h('div', { class: 'fila-campos' },
        h('div', { class: 'campo' },
          h('label', {}, 'Interés por cada 7 días (%)'),
          tasa,
          h('div', { class: 'ayuda' }, 'Por defecto 5. Admite decimales, por ejemplo 5.5')),
        h('div', { class: 'campo', style: 'display:flex;align-items:flex-end' },
          h('div', { style: 'width:100%' },
            botonTasa,
            h('div', { class: 'ayuda' }, 'Solo afecta a los préstamos que crees desde ahora.')))),
      h('div', { class: 'campo' },
        h('label', {}, 'Nombre de tu negocio (aparece en los mensajes de WhatsApp)'),
        h('input', { type: 'text', id: 'nombreNegocio', value: ajustes.negocio || '' })),
      botonNombre));

  /* ---------------- Respaldo ---------------- */

  const zonaRespaldos = h('div', { class: 'tabla-envoltura' });

  function pintarRespaldos(lista) {
    if (!lista.length) {
      zonaRespaldos.replaceChildren(h('p', { style: 'margin:0;color:var(--gris-500)' },
        'Todavía no hay respaldos. La app crea uno automáticamente al abrir y al cerrar.'));
      return;
    }
    zonaRespaldos.replaceChildren(h('table', { class: 'tabla' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Archivo'),
        h('th', {}, 'Creado'),
        h('th', { class: 'num' }, 'Tamaño'),
        h('th', { class: 'num' }, ''))),
      h('tbody', {}, ...lista.map((respaldo) => h('tr', {},
        h('td', { class: 'negrita mono-num', style: 'font-size:12.5px' }, respaldo.nombre),
        h('td', { class: 'nowrap' }, respaldo.fecha),
        h('td', { class: 'num' }, formatearTamano(respaldo.bytes)),
        h('td', {},
          h('button', {
            class: 'btn btn-claro btn-pequeno', type: 'button',
            onclick: async () => {
              const ok = await confirmar('Restaurar respaldo',
                `Se reemplazarán TODOS los datos actuales por los del respaldo "${respaldo.nombre}". `
                + 'Antes de hacerlo, la app guarda una copia de lo actual, así que no se pierde nada. '
                + '¿Continuar?', 'Sí, restaurar');
              if (!ok) return;
              try {
                await api.restaurarRespaldo(respaldo.nombre);
                avisar('Respaldo restaurado. Recargando…', 'exito');
                setTimeout(() => location.reload(), 900);
              } catch (error) { avisar(error.message, 'error'); }
            },
          }, 'Restaurar')))))));
  }

  pintarRespaldos(respaldos);

  const botonRespaldo = h('button', { class: 'btn btn-primario', type: 'button' },
    h('span', { class: 'con-icono' }, icono('guardar', 'chico'), 'Crear respaldo ahora'));

  botonRespaldo.addEventListener('click', async () => {
    botonRespaldo.disabled = true;
    try {
      const info = await api.crearRespaldo();
      avisar(`Respaldo creado: ${info.nombre}`, 'exito');
      pintarRespaldos(await api.respaldos());
    } catch (error) {
      avisar(error.message, 'error');
    } finally {
      botonRespaldo.disabled = false;
    }
  });

  const tarjetaRespaldo = h('div', { class: 'tarjeta' },
    h('div', { class: 'tarjeta-cabecera' },
      h('h2', {}, h('span', { class: 'con-icono' }, icono('guardar'), 'Respaldo de la base de datos')),
      h('span', { class: 'crece' }),
      h('span', { class: 'etiqueta verde' }, `${respaldos.length} archivo(s)`)),
    h('div', { class: 'tarjeta-cuerpo' },
      h('div', { class: 'nota-info verde' },
        'La app guarda un respaldo automático al abrir y al cerrar. Además puedes crear uno cuando quieras '
        + 'con el botón de abajo. Se conservan los últimos 40 respaldos.'),
      h('div', { class: 'acciones' }, botonRespaldo,
        h('button', {
          class: 'btn btn-claro', type: 'button',
          onclick: () => {
            abrirModal({
              titulo: '¿Dónde están mis datos?',
              contenido: h('div', {},
                h('p', {}, 'Todo está guardado dentro de esta carpeta, en tu laptop:'),
                h('div', { class: 'dato-caja mono-num', style: 'font-size:12px;word-break:break-all' },
                  estado.baseDatos),
                h('p', {}, 'Y los respaldos en:'),
                h('div', { class: 'dato-caja mono-num', style: 'font-size:12px;word-break:break-all' },
                  estado.baseDatos.replace(/[^\\/]+$/, '') + 'respaldos\\'),
                h('p', { style: 'margin-bottom:0' },
                  'Para copiar todo a una memoria USB, solo copia la carpeta "datos" completa.')),
              pie: [h('button', {
                class: 'btn btn-primario', type: 'button', onclick: () => document.querySelector('.modal-fondo')?.remove(),
              }, 'Entendido')],
            });
          },
        }, '¿Dónde están mis datos?')),
      zonaRespaldos));

  /* ---------------- Exportar ---------------- */

  const tarjetaExportar = h('div', { class: 'tarjeta' },
    h('div', { class: 'tarjeta-cabecera' },
      h('h2', {}, h('span', { class: 'con-icono' }, icono('tabla'), 'Exportar a Excel'))),
    h('div', { class: 'tarjeta-cuerpo' },
      h('div', { class: 'nota-info' },
        'Se descargan clientes, préstamos, cronograma de cuotas, abonos y capital. '
        + 'El archivo se abre con doble clic en Excel o Google Sheets.'),
      h('div', { class: 'acciones' },
        h('a', {
          class: 'btn btn-primario', href: '/api/exportar', download: '',
        }, h('span', { class: 'con-icono' }, icono('descargar', 'chico'), 'Descargar CSV')),
        h('button', {
          class: 'btn btn-claro', type: 'button',
          onclick: async (evento) => {
            evento.currentTarget.disabled = true;
            try {
              const info = await api.guardarCsv();
              avisar(`Archivo guardado en: ${info.ruta}`, 'exito');
            } catch (error) { avisar(error.message, 'error'); }
            evento.currentTarget.disabled = false;
          },
        }, h('span', { class: 'con-icono' }, icono('guardar', 'chico'), 'Guardar en la carpeta "datos"')))));

  /* ---------------- Datos de la app ---------------- */

  const tarjetaInfo = h('div', { class: 'tarjeta' },
    h('div', { class: 'tarjeta-cabecera' }, h('h2', {}, 'ℹ Sobre esta aplicación')),
    h('div', { class: 'tarjeta-cuerpo' },
      h('div', { class: 'lista-datos' },
        h('div', { class: 'dato-caja' }, h('div', { class: 'et' }, 'Base de datos'),
          h('div', { class: 'vl chico mono-num', style: 'word-break:break-all;font-size:11px' },
            estado.baseDatos)),
        h('div', { class: 'dato-caja' }, h('div', { class: 'et' }, 'Conexión'),
          h('div', { class: 'vl chico' }, 'Solo tu laptop'),
          h('div', { class: 'ayuda' }, 'Nunca se sube a internet')),
        h('div', { class: 'dato-caja' }, h('div', { class: 'et' }, 'Fecha del sistema'),
          h('div', { class: 'vl chico' }, formatearFecha(estado.hoy)))),
      h('div', { class: 'nota-info verde', style: 'margin-top:14px' },
        'Para apagar la app: cierra la ventana negra de consola. Antes de cerrarse, guarda un respaldo.'),
      h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' },
        h('button', { class: 'btn btn-claro', type: 'button', onclick: () => ir('dashboard') },
          'Volver al dashboard'),
        h('button', {
          class: 'btn btn-claro', type: 'button',
          onclick: () => location.reload(),
        }, 'Recargar la app'))));

  contenedor.replaceChildren(
    tarjetaInteres, tarjetaRespaldo, tarjetaExportar, tarjetaInfo,
    h('div', { style: 'height:30px' }),
  );
}

/** 1234567 -> "1.2 MB" */
function formatearTamano(bytes) {
  if (!bytes) return '0 KB';
  const unidades = ['B', 'KB', 'MB', 'GB'];
  let valor = bytes;
  let indice = 0;
  while (valor >= 1024 && indice < unidades.length - 1) {
    valor /= 1024;
    indice += 1;
  }
  return `${valor.toFixed(valor < 10 && indice > 0 ? 1 : 0)} ${unidades[indice]}`;
}
