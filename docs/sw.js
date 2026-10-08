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

const VERSION = 'v4';
const CACHE = `prestamos-su-${VERSION}`;

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
