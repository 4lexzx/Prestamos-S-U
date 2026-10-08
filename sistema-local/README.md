# Gestión de Préstamos

Aplicación para llevar el control de tus préstamos de dinero en soles.
Funciona **solo en tu computadora**, sin internet y sin pagar nada.
Todos los datos se guardan en tu propia laptop, en la carpeta `datos`.

---

## 1. Cómo abrirla

1. Instala **Node.js** (solo la primera vez, unos 5 minutos):
   - Entra a <https://nodejs.org>
   - Pulsa el botón verde **LTS** para descargarlo
   - Ábrelo y pulsa **Next** hasta el final
2. Haz **doble clic** en el archivo **`INICIAR.bat`**.
3. Espera unos segundos: se abrirá el navegador con la aplicación.
4. **No cierres la ventana negra** mientras estés usando la app.

Para salir: cierra la ventana negra. Tus datos quedan guardados y se crea un
respaldo automático.

### Si dice que el puerto 4321 está ocupado

Cierra otras ventanas de la app y vuelve a abrir `INICIAR.bat`.
Si sigue ocupado, abre *Símbolo del sistema*, escribe `set PUERTO=4322`,
ejecuta `node servidor.js` y abre <http://127.0.0.1:4322>.

---

## 2. Cómo se cobra el interés

La regla es sencilla: **cada 7 días exactos se cobra el porcentaje que tú pongas**.
Por defecto es **5 %**.

| Plazo del préstamo | Interés |
|---|---|
| 1 semana (7 días) | 5 % |
| 2 semanas (14 días) | 10 % |
| 1 mes (30 días) | 21.43 % |
| 10 días | 7.14 % (5 % + 2.14 % de los 3 días sueltos) |

Los días que no completan una semana se prorratean solos.

**Ejemplo (S/ 200 en 4 cuotas semanales):**

- Interés: 5 % × 4 semanas = **20 %** → S/ 40.00
- Total a pagar: 200 + 40 = **S/ 240.00**
- Cada cuota: 240 ÷ 4 = **S/ 60.00**
  - de eso, S/ 10.00 son interés y S/ 50.00 son capital

Puedes cambiar el porcentaje en **Ajustes**. Si en un caso especial necesitas otra
tasa, al crear el préstamo puedes escribir un **interés manual** y la app lo respeta.

Las frecuencias disponibles son **semanal** (cada 7 días) y **diaria**.

---

## 3. Qué puedes hacer

| Sección | Para qué sirve |
|---|---|
| **Inicio** | Resumen del día: cuánto cobrar hoy, en la semana, cuántas cuotas están atrasadas. |
| **Clientes** | Registrar y editar clientes (nombre, teléfono, DNI, dirección, notas). Ver su historial. |
| **Préstamos** | Crear préstamos, ver el cronograma, filtrar por cliente o por fecha, y ver el calendario de vencimientos. |
| **Cobrar** | Marcar cuotas como pagadas y mandar recordatorios por WhatsApp. |
| **Capital** | Cuánto dinero tienes prestado, cuánto has recuperado y cuánto te deben. |
| **Ajustes** | Cambiar la tasa, tu nombre de negocio, respaldar y restaurar la base de datos, exportar a Excel. |

### Detalle de un préstamo

Desde cualquier lista puedes abrir un préstamo y ver:

- El cronograma completo con fecha, monto, interés y capital de cada cuota.
- Botón **Pagar cuota** y **Deshacer** (por si te equivocaste).
- **Abonos / adelantos**: si el cliente te paga por adelantado, lo registras como
  abono y la app lo descuenta de las cuotas siguientes. Un abono nunca puede ser
  mayor a lo que falta cobrar.
- **Refinanciar**: extender el plazo. Se cierra el préstamo actual y se abre uno
  nuevo por el capital que falta, con su propio interés. Lo ya cobrado queda en el historial.
- Botones de **WhatsApp** con el mensaje listo para copiar y enviar.

---

## 4. Dónde están tus datos

```
PRESTAMOS/
├── INICIAR.bat              ← abre la app
├── datos/
│   ├── prestamos.db         ← TODA tu información
│   └── respaldos/           ← copias de seguridad automáticas
└── (carpetas con archivos .js, solo código de la app)
```

**Respaldos automáticos:** la app crea uno al abrir y otro al cerrar.
También puedes crear uno a mano desde **Ajustes → Respaldos**, y restaurarlo si
algo salió mal.

**Copia de seguridad:** cada semana, copia la carpeta `datos` a
una memoria USB o a tu nube. Es lo único que necesitas para no perder nada.

**Exportar a Excel:** en Ajustes puedes descargar un CSV que se abre directo en Excel.

---

## 5. Problemas frecuentes

**"No se pudo conectar con el servidor local"**
Cierra la ventana negra y vuelve a abrir `INICIAR.bat`.

**"El puerto 4321 ya está ocupado"**
Ya hay otra copia de la app abierta. Ciérrala (ventana negra) y vuelve a abrirla.

**"NODE.JS no se encontró"**
Node.js no está instalado. Sigue los pasos del punto 1.

**La página se ve sin estilos**
Recarga con `Ctrl + F5` para borrar la caché del navegador.

**¿Necesito internet?**
No. Solo la primera vez, para descargar Node.js.

---

## 6. Detalles técnicos (solo si los necesitas)

- **Node.js 22 o superior**, sin ninguna librería externa.
- **Base de datos:** SQLite con el módulo `node:sqlite` incluido en Node.
- **Servidor:** `node:http` escuchando solo en `127.0.0.1` (nadie de internet puede entrar).
- **Cálculos:** todo se trabaja en céntimos (números enteros) para evitar errores de redondeo.
- **Interfaz:** HTML, CSS y JavaScript sin frameworks, pensada para celular y computadora.

Comprobar que todo está bien desde una terminal, dentro de la carpeta del proyecto:

```
node --check servidor.js
node --check compartido/calculo.js
node --check compartido/moneda.js
node --check public/app.js
node --check public/ui.js
```