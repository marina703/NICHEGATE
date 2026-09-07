@echo off
title NicheGate Server
echo.
echo   ============================================
echo     NICHEGATE - Starting server...
echo     Open: http://localhost:5000
echo   ============================================
echo.
echo Stopping any existing server on port 5000...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul
echo Starting server...
cd /d C:\Users\linde\.skales-data\workspace\nichegate
node server/index.js
pause
