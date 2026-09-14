@echo off
taskkill /IM DshTile.exe /F >nul 2>&1
echo DSH Web desktop tile stopped. Run DshTile.exe (or log in again) to bring it back.
pause
