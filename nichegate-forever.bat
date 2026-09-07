@echo off
title NicheGate 24-7 (auto-restart)
cd /d C:\Users\linde\.skales-data\workspace\nichegate
if not exist logs mkdir logs

:loop
echo [%date% %time%] NicheGate starting... >> logs\nichegate.log
node server/index.js >> logs\nichegate.log 2>&1
echo [%date% %time%] server exited unexpectedly - restarting in 5s >> logs\nichegate.log
timeout /t 5 /nobreak >nul
goto loop
