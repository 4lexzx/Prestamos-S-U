# Préstamos S/U — versión para el celular (PWA)

Esta carpeta (`docs/`) es una aplicación completa que corre **dentro del
navegador del teléfono**: se instala como una app, funciona **sin internet**
y guarda los datos **en ese teléfono**.

Es la misma lógica de cálculo que el sistema de PC, así que los números
coinciden siempre: intereses, cronogramas, atrasos, capital.

## 1. Publicarla

La app se publica sola. El workflow `.github/workflows/pages.yml` sube esta
carpeta (`docs/`) a **GitHub Pages** cada vez que se hace push a `main`.

- URL: **https://4lexzx.github.io/Prestamos-S-U/**
- Configuración del repo (ya hecha): **Settings → Pages → Source: GitHub Actions**.
- Estado de los despliegues: pestaña **Actions** del repositorio.

Si la URL diera 404, entra a *Settings → Pages* y comprueba que la fuente
esté en **GitHub Actions**; después vuelve a lanzar el workflow desde
*Actions → Publicar la PWA en GitHub Pages → Run workflow*.

## 2. Instalarla en el teléfono

Abre la URL en Chrome (Android) o Safari (iPhone):

- **Android**: menú ⋮ → *Instalar aplicación* / *Añadir a pantalla de inicio*.
- **iPhone**: botón compartir → *Añadir a pantalla de inicio*.

Queda un icono propio y se abre a pantalla completa, como cualquier app.

### Cómo se mueve en el teléfono

En pantallas de celular la navegación vive **abajo, al alcance del pulgar**:

- **Barra inferior** con 5 secciones: Panel, Cobrar, Préstamos, Clientes y
  Capital. Un toque y cambias de sección; la pestaña activa se pone verde.
- **Ajustes** está en el engranaje de la esquina superior derecha.
- **Botón flotante verde (+)** abajo a la derecha: registra un préstamo desde
  cualquier pantalla sin tener que buscar en el menú.
- Las tablas se convierten en **filas de una sola línea de altura** en tres
  renglones apretados: el nombre y el importe arriba, el desglose debajo
  (cuotas, capital, interés…) y los botones al pie de cada fila. Cabe el
  doble de registros en pantalla que con las tarjetas de antes, y ningún
  importe se corta.
- En **Clientes** y **Préstamos** las filas están **plegadas**: solo se ve el
  nombre y el saldo, y el resto (ubicación, cuotas, atraso y los botones)
  aparece al tocar la fila. Un toque más y se vuelve a plegar. Así se pasa
  de un cliente a otro sin tener que hacer scroll.
- El resto es **más tranquilo**: colores neutros con verde y rojo solo donde
  importa (a favor, en contra), tarjetas y tablas con menos aire y bloques que
  **entran con un fundido suave** a medida que bajas. Si el teléfono tiene
  activado "reducir movimiento", las animaciones se apagan solas.

En la computadora (pantalla ancha) el diseño es el de siempre: barra lateral
con el menú y las tablas en su formato de columnas.

## 3. Avisos de cobro

La app te recuerda los cobros **dos veces**: **un día antes** y **el mismo
día**, a primera hora (**07:30**).

- **Aviso del sistema**: aparece en la barra de notificaciones del teléfono,
  con lo que cobras, cuánto hay atrasado y qué toca mañana.
- Si la app está abierta, además suena **un pitido suave**.
- Cada aviso queda anotado en la **bandeja de la app** (campana de la esquina
  superior, con una bolita roja cuando hay avisos nuevos): 1 entrada por día,
  aunque no tengas permiso de notificaciones. Dentro puedes verlos y vaciarla.
- En **Ajustes → Sonidos y avisos** se activan o se apagan, y ahí mismo se
  concede el permiso del navegador (haz falta una sola vez).

Los avisos salen **una sola vez por día**, aunque abras la app varias veces.

### Sonidos

- **Pitido al cobrar** una cuota y **al registrar un préstamo** (en
  *Ajustes → Sonidos y avisos* se apaga; hay botón de prueba).
- Se generan con el propio navegador, no hay archivos de audio que descargar
  ni que ocupen espacio.
- Si el teléfono está en silencio, no suena: es el propio celular quien manda.

> **Sobre los avisos automáticos:** la web no puede programar notificaciones
> para dentro de unas horas sin un servidor detrás, y esta app no tiene
> servidor. Por eso el aviso se lanza en cuanto abres la app, cada vez que
> vuelves a ella, y cada tanto si el navegador lo permite. Mientras la
> aplicación esté instalada o abierta, no te lo pierdes.

## 4. Sin login

**No hay pantalla de acceso.** La app se abre directa al dashboard: en este
teléfono solo hay una persona usándola, así que no hace falta candado.

- Internamente los datos siguen guardándose bajo un nombre de usuario
  (`principal`), pero eso es un detalle técnico: no se pide, no se elige, no
  se cambia.
- Si vienes de una versión anterior que sí tenía candado, **se respeta el
  usuario que ya tenías**: tus datos siguen ahí, no hace falta volver a
  entrar.
- Quien coja el teléfono ve los datos. Si eso te preocupa, el candado de
  bloqueo del propio celular es la barrera.

## 5. Dónde están los datos

Todo vive en el **almacenamiento del navegador** (IndexedDB) de ese dispositivo:

- No se sube nada a internet: no hay servidor detrás, no hay nube.
- Si borras los datos del navegador, se pierde todo.

### Si la instalaste como APK

La app instalada está configurada con el **copia de seguridad automática de
Android** (`android:allowBackup` + reglas en `backup_rules.xml` y
`data_extraction_rules.xml`). Eso significa que, si el teléfono tiene activada
la copia de Google, al desinstalar y volver a instalar **los datos vuelven
solos**.

Para que funcione se necesitan dos cosas en el teléfono:

1. Estar iniciado en una **cuenta de Google**.
2. **Ajustes del teléfono → Sistema → Copia de seguridad** activada.

> La copia de Google tarda hasta ~24 horas en subirse (y solo se sube con
> WiFi y batería, por defecto). Si desinstalas a las pocas horas de haber
> instalado, puede que todavía no se haya copiado. Por eso **sigue siendo
> buena idea descargar un respaldo desde Ajustes** de vez en cuando.

## 6. Llevar los datos desde la computadora

Pantalla **Ajustes → Llevar mis datos a otro equipo**:

1. En la computadora abre el sistema local y genera un respaldo
   (o copia el archivo `datos/prestamos.db`).
2. En el teléfono, pulsa **Importar base `.db`** y elige ese archivo.
3. Confirma el reemplazo: verás los clientes y préstamos al recargar.

También puedes importar un **respaldo JSON** exportado desde el propio teléfono
(eso sirve para restaurar o para copiar los datos a otro dispositivo).

## 7. Copias de seguridad y Excel

En **Ajustes** tienes:

- **Descargar CSV**: baja un archivo con clientes, préstamos, cronograma,
  abonos y capital. Se abre directo en Excel o Google Sheets.
- **Respaldos**: copias de la base completa dentro del teléfono.
- **Descargar mis datos (JSON)**: archivo portable para llevártelo a otro equipo.

## 8. Cómo está hecha

| Archivo | Función |
|---|---|
| `index.html` | La única página; monta todo |
| `js/arranque.js` | Carga el motor SQLite → elige el usuario del teléfono → abre su base → arranca la app |
| `js/auth.js` | El usuario de este teléfono (sin login: es un identificador interno) |
| `js/datos.js` | Guardado en IndexedDB, una base por usuario |
| `js/sqlite.js` | SQLite compilado a WebAssembly (sql.js) con la misma API que `node:sqlite` |
| `js/negocio.js` + `js/rutas.js` | La lógica y las rutas del servidor, ejecutándose en el navegador |
| `js/migra.js` | Importar `.db` / respaldos JSON |
| `js/sonidos.js` | Pitidos de cobro y de préstamo (sonido generado en el navegador) |
| `js/recordatorios.js` | Avisos de cobro: resumen, permiso, bandeja (localStorage), notificación del sistema y programación |
| `api.js` | Fachada: mismas llamadas que el servidor, resueltas en local |
| `sw.js` | Service worker: precaché de 34 archivos, modo sin conexión y avisos en segundo plano |
| `manifest.webmanifest` + `iconos/` | Instalación como app e iconos |

La lógica de negocio está **copiada literalmente** desde el servidor
(`sistema-local/servidor.js`) para que los dos sistemas calculen exactamente
lo mismo. Si cambias una regla en el servidor, hay que volver a generar
`js/negocio.js` y `js/rutas.js`.
