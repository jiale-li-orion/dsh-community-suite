@echo off
rem ============================================================================
rem  Meshfin Web launcher (Windows side)
rem
rem  Run this file, or the desktop shortcut that setup.cmd creates, to start the
rem  harness from wherever this distribution was extracted and open the browser
rem  once the port actually answers.
rem
rem  Lifetime contract:
rem    * closing the browser window     -> the server keeps running
rem    * closing this console window    -> the server stops
rem    * Ctrl+C in this console window  -> the server stops
rem
rem  Environment / arguments:
rem    start-meshfin.cmd [port]     port to serve on (default 3080)
rem    MESHFIN_NO_BROWSER=1         do not open a browser
rem ============================================================================
setlocal
set "HERE=%~dp0"
set "PORT=%~1"
if "%PORT%"=="" set "PORT=3080"

if not exist "%HERE%meshfin.ps1" (
  echo [launcher] meshfin.ps1 was not found next to this file. 1>&2
  echo [launcher] Extract the whole archive and run this file from its root. 1>&2
  exit /b 1
)

if not "%MESHFIN_NO_BROWSER%"=="1" (
  start "" /b powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%desktop\windows\open-when-ready.ps1" -Port %PORT%
)

echo [launcher] starting Meshfin on port %PORT% ...
echo [launcher] closing the browser keeps it running; closing this window stops it.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%meshfin.ps1" web --port %PORT%
