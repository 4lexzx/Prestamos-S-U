// Aplica las reglas de copia de seguridad de Android al proyecto generado.
// Se puede volver a ejecutar tras un `bubblewrap update`, que regenera todo.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const raiz = process.argv[2] || '.';
const res = join(raiz, 'app', 'src', 'main', 'res', 'xml');
const manifest = join(raiz, 'app', 'src', 'main', 'AndroidManifest.xml');

mkdirSync(res, { recursive: true });

// Exclusiones comunes: solo caches, nunca los datos.
const exclusiones = `
        <exclude domain="root" path="cache" />
        <exclude domain="root" path="code_cache" />
        <exclude domain="root" path="app_webview/Default/Cache" />
        <exclude domain="root" path="app_webview/Default/Code Cache" />
        <exclude domain="root" path="app_webview/Default/GPUCache" />
        <exclude domain="root" path="app_webview/ShaderCache" />
        <exclude domain="root" path="app_webview/GPUCache" />`;

writeFileSync(join(res, 'backup_rules.xml'), `<?xml version="1.0" encoding="utf-8"?>
<!--
    Reglas de copia de seguridad para Android 11 y anteriores.

    Los datos de la app viven en IndexedDB, que el navegador guarda dentro de
    "app_webview/". Eso esta en la raiz del directorio de datos de la app, no
    en "files/" ni en "databases/", por eso hay que incluir el dominio "root".

    Sin esto, al desinstalar y reinstalar el telefono arrancaria vacio.
    La cache del service worker NO se excluye: al restaurar, la app vuelve a
    funcionar sin internet desde el primer momento.
-->
<full-backup-content>
    <include domain="root" path="." />${exclusiones}
</full-backup-content>
`);

writeFileSync(join(res, 'data_extraction_rules.xml'), `<?xml version="1.0" encoding="utf-8"?>
<!--
    Reglas de copia de seguridad para Android 12 y superior.

    cloud-backup   -> lo que sube a la cuenta de Google.
    device-transfer-> lo que se pasa al cambiar de telefono.
-->
<data-extraction-rules>
    <cloud-backup>
        <include domain="root" path="." />${exclusiones}
    </cloud-backup>

    <device-transfer>
        <include domain="root" path="." />${exclusiones}
    </device-transfer>
</data-extraction-rules>
`);

if (!existsSync(manifest)) throw new Error('No se encontro ' + manifest);
let xml = readFileSync(manifest, 'utf8');

if (!xml.includes('android:fullBackupContent')) {
  xml = xml.replace(
    /(android:allowBackup="true")/,
    `$1
        android:fullBackupContent="@xml/backup_rules"
        android:dataExtractionRules="@xml/data_extraction_rules"`,
  );
  writeFileSync(manifest, xml);
  console.log('Manifest parcheado.');
} else {
  console.log('El manifest ya tenia las reglas; no se toco.');
}

console.log('backup_rules.xml       ->', join(res, 'backup_rules.xml'));
console.log('data_extraction_rules  ->', join(res, 'data_extraction_rules.xml'));
