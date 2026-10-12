/**
 * ============================================================================
 *  SW.JS - Service worker de la PWA
 * ============================================================================
 *  Estrategia: "stale-while-revalidate" sobre los archivos de la app.
 *
 *   - Primero responde con la copia guardada: la app abre al instante y
 *     sigue funcionando aunque no haya internet.
 *   - Mientras tanto vuelve a pedir el archivo a la red y, si cambio,
 *     lo deja actualizado para la proxima vez que abras.
 *
 *  Los datos NUNCA pasan por aqui: la base vive en IndexedDB, no en la
 *  cache. Aqui solo se guardan los archivos de la aplicacion.
 *
 *  Importante: al subir una version nueva hay que subir VERSION para que
 *  el navegador descarte la cache vieja.
 * ============================================================================
 */

const VERSION = 'v10';
const CACHE = `prestamos-su-${VERSION}`;

/** Caché aparte donde la app deja escrita la lista de cobros pendientes. */
const CACHE_RECORDATORIOS = 'prestamos-recordatorios';

const ARCHIVOS = [
  './',
  './index.html',
  './estilos.css',
  './manifest.webmanifest',
  './app.js',
  './api.js',
  './estado.js',
  './ui.js',
  './js/arranque.js',
  './js/auth.js',
  './js/datos.js',
  './js/migra.js',
  './js/negocio.js',
  './js/rutas.js',
  './js/sonidos.js',
  './js/recordatorios.js',
  './js/sqlite.js',
  './compartido/calculo.js',
  './compartido/moneda.js',
  './modales/prestamo-form.js',
  './vistas/ajustes.js',
  './vistas/capital.js',
  './vistas/cliente.js',
  './vistas/clientes.js',
  './vistas/cobrar.js',
  './vistas/dashboard.js',
  './vistas/prestamo.js',
  './vistas/prestamos.js',
  './vendor/sql-wasm.js',
  './vendor/sql-wasm.wasm',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './iconos/icono-mascara-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Uno por uno: si alguno falla, el resto igual queda guardado.
    await Promise.all(ARCHIVOS.map(async (archivo) => {
      try {
        const respuesta = await fetch(archivo, { cache: 'reload' });
        if (respuesta.ok) await cache.put(archivo, respuesta);
      } catch { /* sin red: ya estara en la proxima instalacion */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(
      claves
        .filter((clave) => clave.startsWith('prestamos-su-') && clave !== CACHE)
        .map((clave) => caches.delete(clave)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (evento) => {
  if (evento.data === 'actualizar-cache') self.skipWaiting();
});

/* ==========================================================================
   RECORDATORIOS DE COBRO EN SEGUNDO PLANO
   La app deja escrita en la caché la lista de cuotas que tocan hoy y mañana.
   Aquí, cuando el navegador nos deja trabajar sin abrir la app, comprobamos
   si toca avisar y lanzamos la notificación (una sola vez por día).
   ========================================================================== */

const isoLocal = (fecha) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

const dinero = (valor) => `S/ ${(Number(valor) || 0).toLocaleString('es-PE', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;

async function avisarDeLosCobros() {
  try {
    const cache = await caches.open(CACHE_RECORDATORIOS);
    const guardado = await cache.match('/__recordatorios__/pendientes');
    if (!guardado) return;

    const datos = await guardado.json();
    const hoy = isoLocal(new Date());
    const manana = isoLocal(new Date(Date.now() + 86400000));
    const pendientes = (datos.pendientes || []).filter((p) => p.fecha === hoy || p.fecha === manana);
    if (!pendientes.length) return;

    // Una sola vez por día
    const marca = await cache.match('/__recordatorios__/ultimo-aviso');
    if (marca && (await marca.text()) === hoy) return;

    const deHoy = pendientes.filter((p) => p.fecha === hoy);
    const deManana = pendientes.filter((p) => p.fecha === manana);
    const suma = (lista) => lista.reduce((t, p) => t + (Number(p.monto) || 0), 0);

    const lineas = [];
    if (deHoy.length) lineas.push(`Hoy: ${deHoy.length} cuota(s) · ${dinero(suma(deHoy))}`);
    if (deManana.length) lineas.push(`Mañana: ${deManana.length} cuota(s) · ${dinero(suma(deManana))}`);

    const titulo = deHoy.length
      ? `Cobras hoy ${dinero(suma(deHoy))}`
      : `Mañana cobras ${dinero(suma(deManana))}`;

    await self.registration.showNotification(titulo, {
      body: lineas.join('\n'),
      tag: `recordatorio-${hoy}`,
      icon: './iconos/icono-192.png',
      badge: './iconos/icono-192.png',
      silent: true,
      data: { ruta: '#/cobrar' },
    });

    await cache.put('/__recordatorios__/ultimo-aviso', new Response(hoy));
  } catch { /* sin datos o sin permiso: no pasa nada */ }
}

self.addEventListener('periodicsync', (evento) => {
  if (evento.tag !== 'recordatorios') return;
  evento.waitUntil(avisarDeLosCobros());
});

/* Al tocar la notificación: abrir o recuperar la app y ir a la pantalla de cobrar. */
self.addEventListener('notificationclick', (evento) => {
  const destino = (evento.notification.data && evento.notification.data.ruta) || '#/cobrar';
  evento.notification.close();
  evento.waitUntil((async () => {
    try {
      const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const cliente of abiertas) {
        if (!('focus' in cliente)) continue;
        await cliente.focus();
        if ('postMessage' in cliente) cliente.postMessage({ ir: destino });
        return;
      }
      if (self.clients.openWindow) await self.clients.openWindow(`./${destino}`);
    } catch { /* el sistema bloquea abrir ventanas */ }
  })());
});

self.addEventListener('fetch', (evento) => {
  const solicitud = evento.request;
  if (solicitud.method !== 'GET') return;

  const url = new URL(solicitud.url);
  if (url.origin !== self.location.origin) return;

  // Solo nos metemos con los archivos de la aplicacion.
  const esDeLaApp = url.pathname.startsWith(new URL('./', self.location.href).pathname);
  if (!esDeLaApp) return;

  evento.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const copia = await cache.match(solicitud, { ignoreSearch: true });

    const promesaDeRed = fetch(solicitud)
      .then(async (respuesta) => {
        if (respuesta && respuesta.ok && respuesta.type === 'basic') {
          await cache.put(solicitud, respuesta.clone());
        }
        return respuesta;
      })
      .catch(() => null);

    if (copia) {
      // Respondemos ya con lo guardado y actualizamos en segundo plano.
      evento.waitUntil(promesaDeRed.then(() => {}));
      return copia;
    }

    const respuesta = await promesaDeRed;
    if (respuesta) return respuesta;

    // Sin red y sin copia: si es una navegacion, mostramos el indice.
    const indice = await cache.match('./index.html', { ignoreSearch: true });
    if (indice && solicitud.mode === 'navigate') return indice;
    return new Response('Sin conexion.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
