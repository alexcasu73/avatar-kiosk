@echo off
title Avatar Kiosk — Installazione
cd /d "%~dp0"

echo.
echo ============================================
echo   AVATAR KIOSK - Installazione
echo ============================================
echo.

:: ── Node.js ──────────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRORE] Node.js non trovato.
    echo          Installalo da https://nodejs.org (versione 18 o superiore^)
    pause & exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo [OK]    Node.js %NODE_VER%

:: Controlla versione minima 18
node -e "if(parseInt(process.version.slice(1)) < 18){ process.exit(1) }" >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRORE] Node.js %NODE_VER% troppo vecchio. Richiesta versione 18+.
    pause & exit /b 1
)

:: ── npm install ───────────────────────────────────────────────────────────
echo [INFO]  Installazione dipendenze npm...
npm install --omit=dev
if %errorlevel% neq 0 (
    echo [ERRORE] npm install fallito.
    pause & exit /b 1
)
echo [OK]    Dipendenze installate

:: ── .env ──────────────────────────────────────────────────────────────────
if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo [INFO]  File .env creato da .env.example
    echo.
    echo   ^^!  CONFIGURA LE API KEY nel file .env prima di avviare:
    echo        - ANTHROPIC_API_KEY
    echo        - ELEVENLABS_API_KEY
    echo        - OPENAI_API_KEY
    echo.
) else (
    echo [OK]    .env gia' presente
)

:: ── Directory dati ────────────────────────────────────────────────────────
if not exist "public\models"      mkdir "public\models"
if not exist "public\backgrounds" mkdir "public\backgrounds"
echo [OK]    Directory dati pronte

:: ── Autostart Windows (cartella Startup) ─────────────────────────────────
echo.
set /p AUTOSTART="Vuoi configurare l'avvio automatico al login Windows? [s/N] "
if /i "%AUTOSTART%"=="s" (
    set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
    set "SHORTCUT=%STARTUP_DIR%\Avatar Kiosk.bat"
    echo @echo off > "%SHORTCUT%"
    echo cd /d "%~dp0" >> "%SHORTCUT%"
    echo start "" "%~dp0start-kiosk.bat" >> "%SHORTCUT%"
    echo [OK]    Avvio automatico configurato in Startup
)

:: ── Fine ──────────────────────────────────────────────────────────────────
echo.
echo ============================================
echo   Installazione completata!
echo ============================================
echo.
echo   Avvia il kiosk con:
echo     start-kiosk.bat
echo.
pause
