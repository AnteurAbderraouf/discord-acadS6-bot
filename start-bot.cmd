@echo off
REM Launcher for the verification bot. Restarts it if it crashes.
REM Started at logon by the "DiscordAcadS6Bot" scheduled task (see install-autostart.ps1).
cd /d "%~dp0"
set "LOG=%~dp0bot.log"
set "NODE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"
:loop
echo [%date% %time%] starting bot>>"%LOG%"
"%NODE%" index.js >>"%LOG%" 2>&1
echo [%date% %time%] bot exited, retrying in 15s>>"%LOG%"
timeout /t 15 /nobreak >nul
goto loop
