@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

title Gestion de Prestamos - Servidor Local

echo.
echo  ==============================================================
echo   INICIANDO GESTION DE PRESTAMOS...
echo  ==============================================================
echo.

REM --- Comprobamos que Windows reconoce Node.js ------------------------
where node >nul 2>nul
if errorlevel 1 goto :sin_node

REM --- Avisamos si la version de Node es muy vieja ------------------------
node -e "process.exit(Number(process.versions.node.split(String.fromCharCode(46))[0]) < 22 ? 1 : 0)"
if errorlevel 1 goto :versionVieja

echo   Node.js detectado correctamente.
echo.

REM --- Si quedo un servidor anterior colgado en el puerto, lo cerramos ---
echo   Comprobando el puerto 4321...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$libre=$true; $c=@(Get-NetTCPConnection -LocalPort 4321 -State Listen -ErrorAction SilentlyContinue); foreach($x in $c){ $p=Get-Process -Id $x.OwningProcess -ErrorAction SilentlyContinue; if($p -and $p.ProcessName -like 'node*'){ Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; Write-Host ('   Se cerro un servidor anterior que seguia abierto (PID ' + $p.Id + ')'); Start-Sleep -Milliseconds 700 } else { $libre=$false } }; if($libre -and -not (Get-NetTCPConnection -LocalPort 4321 -State Listen -ErrorAction SilentlyContinue)){ exit 0 } else { exit 1 }"
if errorlevel 1 goto :puertoOcupado

echo   Iniciando... se abrira el navegador en unos segundos.
echo   NO CIERRES ESTA VENTANA mientras uses la aplicacion.
echo.
echo  --------------------------------------------------------------
echo.
node --no-warnings servidor.js
goto :fin

:puertoOcupado
echo.
echo   [X] EL PUERTO 4321 SIGUE OCUPADO por otro programa.
echo.
echo   Cierra cualquier ventana de "Gestion de Prestamos" que quede
echo   abierta, espera unos segundos y vuelve a ejecutar INICIAR.bat
echo.
echo   Si sigue igual, reinicia la computadora.
echo.
pause
exit /b 1

:sin_node
echo.
echo   [X] NO SE ENCONTRO NODE.JS EN ESTA COMPUTADORA.
echo.
echo   Node.js es el unico requisito. Son unos 5 minutos y es gratis:
echo.
echo     1. Entra a  https://nodejs.org
echo     2. Pulsa el boton grande verde "LTS" para descargarlo.
echo     3. Abre el archivo descargado y pulsa "Next" hasta el final.
echo     4. Vuelve a hacer doble clic en INICIAR.bat
echo.
echo   Si ya lo instalaste, reinicia la computadora y prueba otra vez.
echo.
pause
exit /b 1

:versionVieja
echo.
echo   [X] Tu version de Node.js es muy antigua.
echo       Se necesita la version 22 o superior.
echo   Descarga la version mas nueva desde https://nodejs.org
echo.
pause
exit /b 1

:fin
echo.
echo  ==============================================================
echo   La aplicacion se cerro.
echo   Tus datos quedan guardados en la carpeta "datos".
echo   Para volver a usarla, haz doble clic en INICIAR.bat
echo  ==============================================================
echo.
pause
