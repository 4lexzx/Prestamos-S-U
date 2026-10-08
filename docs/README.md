# Préstamos S/U — versión para el celular (PWA)

Esta carpeta (`docs/`) es una aplicación completa que corre **dentro del
navegador del teléfono**: se instala como una app, funciona **sin internet**
y guarda los datos **en ese teléfono**, separados por usuario.

Es la misma lógica de cálculo que el sistema de PC, así que los números
(coinciden siempre): intereses, cronogramas, atrasos, capital.

## 1. Publicarla (se hace una sola vez)

1. En el repositorio de GitHub: **Settings → Pages → Source: GitHub Actions**.
2. Espera a que termine la pestaña **Actions** (el workflow
   `Publicar la PWA en GitHub Pages`).
3. La app queda en `https://4lexzx.github.io/Prestamos-S-U/`.

Cada vez que se sube algo a la rama `main`, GitHub Pages se vuelve a
publicar automáticamente.

## 2. Instalarla en el teléfono

Abre la URL en Chrome (Android) o Safari (iPhone):

- **Android**: menú ⋮ → *Instalar aplicación* / *Añadir a pantalla de inicio*.
- **iPhone**: botón compartir → *Añadir a pantalla de inicio*.

Queda un icono propio y se abre a pantalla completa, como cualquier app.

## 3. Usuarios y claves

- El **primer usuario** que crees en ese teléfono define la cuenta inicial.
- Después puedes crear más usuarios desde la misma pantalla de acceso
  (escribe un nombre nuevo y pulsa *Crear mi cuenta*).
- **Cada usuario tiene su propia base de datos**: los datos de uno no se mezclan
  con los de otro, aunque compartan el teléfono.
- Para saltar de un usuario a otro: botón **Cambiar de usuario** (guarda todo
  antes de salir).

> Las claves se guardan con hash (SHA-256 con sal) y **no salen del
> dispositivo**. Si olvidas la clave no hay forma de recuperarla: crea un
> respaldo y vuelve a empezar, o usa otro nombre de usuario.

## 4. Dónde están los datos

Todo vive en el **almacenamiento del navegador** (IndexedDB) de ese dispositivo:

- Si borras los datos del navegador, se pierde todo.
- No se sube nada a internet: no hay servidor detrás.

Por eso conviene descargar un respaldo de vez en cuando.

## 5. Llevar los datos desde la computadora

Pantalla **Ajustes → Llevar mis datos a otro equipo**:

1. En la computadora abre el sistema local y genera un respaldo
   (o copia el archivo `datos/prestamos.db`).
2. En el teléfono, pulsa **Importar base `.db`** y elige ese archivo.
3. Confirma el reemplazo: verás los clientes y préstamos al recargar.

También puedes importar un **respaldo JSON** exportado desde el propio teléfono
(eso sirve para restaurar o para copiar los datos a otro dispositivo).

## 6. Copias de seguridad y Excel

En **Ajustes** tienes:

- **Descargar CSV**: baja un archivo con clientes, préstamos, cronograma,
  abonos y capital. Se abre directo en Excel o Google Sheets.
- **Respaldos**: copias de la base completa dentro del teléfono.
- **Descargar mis datos (JSON)**: archivo portable para llevártelo a otro equipo.

## 7. Cómo está hecha

| Archivo | Función |
|---|---|
| `index.html` | La única página; monta todo |
| `js/arranque.js` | Carga el motor SQLite → pide usuario → abre su base → arranca la app |
| `js/auth.js` | Usuarios locales, claves con hash, sesión |
| `js/datos.js` | Guardado en IndexedDB, una base por usuario |
| `js/sqlite.js` | SQLite compilado a WebAssembly (sql.js) con la misma API que `node:sqlite` |
| `js/negocio.js` + `js/rutas.js` | La lógica y las rutas del servidor, ejecutándose en el navegador |
| `js/migra.js` | Importar `.db` / respaldos JSON |
| `api.js` | Fachada: mismas llamadas que el servidor, resueltas en local |
| `sw.js` | Service worker: precaché de 31 archivos y modo sin conexión |
| `manifest.webmanifest` + `iconos/` | Instalación como app e iconos |

La lógica de negocio está **copiada literalmente** desde el servidor
(`sistema-local/servidor.js`) para que los dos sistemas calculen exactamente
lo mismo. Si cambias una regla en el servidor, hay que volver a generar
`js/negocio.js` y `js/rutas.js`.
