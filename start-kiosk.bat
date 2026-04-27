@echo off
title Avatar Kiosk
cd /d "%~dp0"

echo ============================================
echo  AVATAR KIOSK - Avvio sistema
echo ============================================

:: Verifica Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRORE] Node.js non trovato. Installalo da https://nodejs.org
    pause
    exit /b 1
)

:: Verifica .env
if not exist ".env" (
    echo [ERRORE] File .env non trovato. Copia .env.example in .env e configura le API key.
    pause
    exit /b 1
)

:: Installa dipendenze se mancano
if not exist "node_modules" (
    echo [INFO] Prima installazione dipendenze...
    npm install
    if %errorlevel% neq 0 (
        echo [ERRORE] npm install fallito.
        pause
        exit /b 1
    )
)

:: Trova browser (Chrome o Edge)
set "BROWSER="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)

if "%BROWSER%"=="" (
    echo [ERRORE] Chrome o Edge non trovati.
    pause
    exit /b 1
)

echo [INFO] Browser: %BROWSER%
echo [INFO] Avvio server Node.js...

:: Avvia server con auto-restart in caso di crash (loop)
start /min cmd /c "title Avatar Kiosk Server && :loop && node server.js && timeout /t 2 /nobreak >nul && goto loop"

:: Attendi che il server sia pronto
echo [INFO] Attendo avvio server...
timeout /t 4 /nobreak >nul

:: Verifica server attivo
curl -s http://localhost:3000/api/health >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Server ancora in avvio, attendo altri 3 secondi...
    timeout /t 3 /nobreak >nul
)

echo [INFO] Apertura kiosk...

:: Profilo Chrome dedicato al kiosk (evita primo avvio / sessione utente)
set "PROFILE_DIR=%~dp0chrome-kiosk-profile"

:: Flags kiosk
set FLAGS=--kiosk
set FLAGS=%FLAGS% --no-first-run
set FLAGS=%FLAGS% --disable-infobars
set FLAGS=%FLAGS% --disable-session-crashed-bubble
set FLAGS=%FLAGS% --disable-restore-session-state
set FLAGS=%FLAGS% --noerrdialogs
set FLAGS=%FLAGS% --disable-pinch
set FLAGS=%FLAGS% --overscroll-history-navigation=0
set FLAGS=%FLAGS% --disable-features=TranslateUI
set FLAGS=%FLAGS% --autoplay-policy=no-user-gesture-required
set FLAGS=%FLAGS% --use-fake-ui-for-media-stream
set FLAGS=%FLAGS% --user-data-dir="%PROFILE_DIR%"

start "" "%BROWSER%" %FLAGS% http://localhost:3000

echo [OK] Kiosk avviato. Chiudi questa finestra per fermare tutto.
pause
