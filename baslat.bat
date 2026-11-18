@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js kurulu degil. https://nodejs.org adresinden LTS surumunu kurup tekrar deneyin. & pause & exit /b 1)
echo Lithos baslatiliyor... Bu pencereyi kapatmayin.
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
node src\server.js
pause
