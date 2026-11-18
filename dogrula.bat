@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js kurulu degil. https://nodejs.org adresinden LTS surumunu kurup tekrar deneyin. & pause & exit /b 1)
echo === Telegram testi ===
node scripts\telegram-baglanti.js
echo.
echo === Veri kaynaklari testi (AFAD, Kandilli, USGS, hava durumu) ===
node scripts\verify.js
pause
