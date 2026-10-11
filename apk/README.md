# APK de Android

Esta carpeta genera el **APK instalable** de la app. Es un envoltorio
(TWA, Trusted Web Activity) que abre la PWA publicada en GitHub Pages con el
WebView del propio teléfono: misma app, mismo código, pero con icono propio
y sin barra de navegador.

La app dentro del envoltorio es **exactamente la misma** que la de
`docs/`. Si cambias algo en `docs/`, haz push y vuelve a compilar.

## Instalar el APK

1. Copia `Prestamos-v1.apk` al teléfono (por USB, por WhatsApp, por correo…).
2. En el teléfono, abre el archivo. Android pedirá permiso para instalar
   aplicaciones de origen desconocido: dale permiso **solo a la app que
   uses para abrirlo** (Administrador de archivos, Chrome…).
3. Confirma. Queda un icono **Préstamos** en el cajón.

> `minSdkVersion` es 24: sirve para Android 7.0 (2016) en adelante.

## Que se vea como app y no como página web

Un APK de Bubblewrap es un envoltorio alrededor de la PWA publicada. Si
Android **no logra verificar** que el dominio le pertenece, el envoltorio
degrada a "página web embebida" y te deja **la barra del navegador encima**.

Para evitarlo, el APK declara que `https://4lexzx.github.io` es suyo, y hace
falta la prueba al revés: un archivo en la **raíz** del dominio que diga
"sí, ese APK soy yo, con esta firma":

```
https://4lexzx.github.io/.well-known/assetlinks.json
```

Ese archivo vive en su propio repositorio,
**[`4lexzx/4lexzx.github.io`](https://github.com/4lexzx/4lexzx.github.io)**,
porque solo un repo con ese nombre sirve en la raíz del dominio. Un repo de
proyecto (como este) se publica bajo `/Prestamos-S-U/` y no puede servirlo.

### Si algún día se vuelve a firmar con otra clave

El archivo incluye la huella SHA-256 del certificado. Cambia la clave y
Android vuelve a no confiar, con el mismo síntoma (aparece la barra del
navegador). Hay que actualizar la huella allí:

```bash
keytool -list -v -keystore clave-apk/android-keystore.keystore -alias android
```

### Síntoma y arreglo

| Se ve la barra del navegador dentro de la app | Archivo no publicado o huella desactualizada |
| Se ve a pantalla completa, sin barra | Todo en orden |

Android cachea el resultado: tras arreglar el archivo hay que **desinstalar
y reinstalar el APK** (o borrar sus datos desde Ajustes → Apps → Préstamos)
para que vuelva a comprobarlo.

## Por qué los datos sobrevivan a desinstalar y reinstalar

Android borra los datos de una app al desinstalarla. Para evitarlo, este APK
viene con la **copia de seguridad automática de Android** activa:

| Archivo | Para qué sirve |
|---|---|
| `app/src/main/res/xml/backup_rules.xml` | Reglas para Android 11 y anteriores |
| `app/src/main/res/xml/data_extraction_rules.xml` | Reglas para Android 12 en adelante |

Ambas incluyen el dominio `root`, que es donde el WebView guarda IndexedDB
(dentro de `app_webview/`). Sin esas reglas, el respaldo incluiría la app
pero **no** los datos, y al reinstalar arrancaría vacío.

En el `AndroidManifest.xml` generado están:

```xml
android:allowBackup="true"
android:fullBackupContent="@xml/backup_rules"
android:dataExtractionRules="@xml/data_extraction_rules"
```

### Lo que hace falta en el teléfono

1. Estar iniciado en una **cuenta de Google**.
2. **Ajustes del teléfono → Sistema → Copia de seguridad** activada.

La copia tarda hasta ~24 h en subirse (y solo con WiFi y batería, por
defecto). Si desinstalas antes de que se copie, los datos se pierden. Por
eso **sigue conviniendo descargar un respaldo desde Ajustes** de vez en
cuando.

## Cómo se compila

Requisitos: **JDK 17**, **Node**, y **Bubblewrap** con su SDK de Android
(bubblewrap los instala solo la primera vez).

```bash
cd apk
bubblewrap update --skipVersionUpgrade     # regenera el proyecto Android
node scripts/aplicar-copia.mjs .           # reaplica las reglas de copia
bubblewrap build                           # compila y firma
```

> **Atención**: si el JDK está en una carpeta con espacios
> (`C:\Program Files\Java\...`), el paso de **firma** de `bubblewrap build`
> falla con `"C:\Program" no se reconoce`. Compila igual y deja el APK
> sin firmar; hay que firmarlo a mano (ver abajo).

### Firma a mano (cuando Bubblewrap falla por el espacio en la ruta)

```bash
JAVA="C:\Program Files\Java\jdk-17\bin\java.exe"
SDK="$USERPROFILE\.bubblewrap\android_sdk\build-tools\36.1.0"
"$JAVA" -Xmx1024M -jar "$SDK\lib\apksigner.jar" sign \
  --ks clave-apk/android-keystore.keystore \
  --ks-key-alias android \
  --ks-pass pass:CONTRASENIA \
  --key-pass pass:CONTRASENIA \
  --out app-release-signed.apk \
  app-release-unsigned-aligned.apk
```

## La clave de firma: guárdala

`clave-apk/android-keystore.keystore` está en `.gitignore`: **nunca se
sube al repo**. Sin esa clave no se puede actualizar la app ya instalada en
los teléfonos (Android rechaza la actualización por firma distinta).

- Contraseña del almacén y de la clave: `prestamos2026`
- alias: `android`

Haz **una copia de ese archivo en un sitio seguro** (USB, disco externo,
nube privada). Si lo pierdes, la única opción es publicar la app con otro
`packageId` y que la gente la instale de cero.

## Cambiar la versión

Edita `twa-manifest.json`:

- `appVersionCode`: número entero, sube de 1 en 1 en cada publicación.
  Android lo usa para saber cuál es más nueva.
- `appVersionName`: el texto que se ve en Ajustes → info de la app.

Después vuelve a compilar (sin `--skipVersionUpgrade` si quieres que
Bubblewrap suba el código solo).

## packageId

`com.lexzx.prestamos`. No empieza por número a propósito: un paquete Java
no puede empezar por cifra, así que `com.4lexzx.prestamos` no compila.

Cambiarlo después de publicar obliga a los teléfonos a desinstalar la
app vieja antes de instalar la nueva (Android lo ve como otra app).
