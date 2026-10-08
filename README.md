# Préstamos S/U

Sistema de gestión de préstamos. Este repositorio contiene **dos sistemas
independientes** que comparten la misma lógica de cálculo:

| Carpeta | Qué es | Dónde corre |
|---|---|---|
| `sistema-local/` | Sistema completo con servidor local y base de datos SQLite | En tu computadora, con `INICIAR.bat` |
| `docs/` | Versión PWA para celular (instalable, offline, con login) | En tu teléfono, publicada con GitHub Pages |

## Datos

**Ninguna base de datos se sube a este repositorio.** Todo lo que está en
`datos/` (clientes, teléfonos, préstamos) queda en tu computadora o en tu
teléfono, nunca en internet.

- En la computadora: `sistema-local/datos/prestamos.db`
- En el celular: dentro del navegador de ese dispositivo, separado por usuario

Para llevar tus datos de la computadora al celular existe un **archivo de
migración** que se genera y se importa a mano. Ese archivo tampoco se sube.

## Sistema local (computadora)

```
cd sistema-local
INICIAR.bat
```

Requisito: Node.js 22 o superior.

## PWA (celular)

Ver [docs/README.md](docs/README.md).
