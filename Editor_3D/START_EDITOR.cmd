@echo off
setlocal
cd /d "%~dp0"
title Nebeljagd - Map-Editor und 3D-Test
py -3 --version >nul 2>&1
if not errorlevel 1 (
    py -3 "%~dp0start_editor.py"
    goto :finished
)
python --version >nul 2>&1
if not errorlevel 1 (
    python "%~dp0start_editor.py"
    goto :finished
)
rem Try the Python bundled with a standard Blender installation.
for /d %%B in ("%ProgramFiles%\Blender Foundation\Blender*") do (
    for /d %%V in ("%%~fB\*") do (
        if exist "%%~fV\python\bin\python.exe" (
            "%%~fV\python\bin\python.exe" "%~dp0start_editor.py"
            goto :finished
        )
    )
)
echo.
echo Kein Python unter den Standardpfaden gefunden.
echo Bitte die genaue Meldung angeben. Es wurden keine Einstellungen geaendert.
:finished
echo.
pause
