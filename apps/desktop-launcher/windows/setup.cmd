@echo off
rem ============================================================================
rem  Meshfin desktop setup
rem
rem  Creates a "Meshfin Web" shortcut on the desktop pointing at this
rem  distribution's launcher, with this distribution's icon, so a later start is
rem  one double-click. Run it once after extracting the archive.
rem
rem  Optional: pass --tile to also build and start the desktop tile, a big
rem  resizable block that sits on the wallpaper itself (see tile\MeshfinTile.cs).
rem ============================================================================
setlocal
set "HERE=%~dp0"
set "TILE=0"
if /i "%~1"=="--tile" set "TILE=1"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$shell = New-Object -ComObject WScript.Shell;" ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$path = Join-Path $desktop 'Meshfin Web.lnk';" ^
  "$link = $shell.CreateShortcut($path);" ^
  "$link.TargetPath = '%HERE%start-meshfin.cmd';" ^
  "$link.WorkingDirectory = '%HERE%';" ^
  "$link.IconLocation = '%HERE%desktop\windows\meshfin.ico';" ^
  "$link.Description = 'Start Meshfin and open its Web UI';" ^
  "$link.Save();" ^
  "Write-Host ('[setup] shortcut created: ' + $path)"

if "%TILE%"=="1" (
  call "%HERE%desktop\windows\tile\build-tile.cmd" || exit /b 1
  call "%HERE%desktop\windows\tile\start-tile.cmd"
)

echo [setup] done.
