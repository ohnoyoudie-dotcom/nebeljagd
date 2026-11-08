@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Magebrawl - Schulserver
pushd "%~dp0" || goto :folder_error

where node >nul 2>&1
if errorlevel 1 goto :node_missing
node -e "var v=process.versions.node.split('.').map(Number); process.exit(v[0]>22 || (v[0]===22 && v[1]>=12) ? 0 : 1)"
if errorlevel 1 goto :node_missing

node "scripts\start-school.js"
echo.
echo Dieses Fenster kann jetzt geschlossen werden.
pause
popd
exit /b

:node_missing
echo Magebrawl braucht einmalig Node.js ab Version 22.12.
echo Installiere die aktuelle LTS-Version von https://nodejs.org/en/download
echo Oeffne danach Magebrawl-starten.cmd erneut.
echo Visual Studio und npm-Befehle sind fuer diesen Start nicht erforderlich.
pause
popd
exit /b 1

:folder_error
echo Der Magebrawl-Projektordner konnte nicht geoeffnet werden.
pause
exit /b 1
