@echo off
cd /d "%~dp0"

if not exist "src-tauri\icons\icon.ico" (
    call npm run create-icon 2>nul
)

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

:: Run in this window so you can see output; window stays open when the app exits
echo.
echo Starting Game Task Widget...
echo.
call npm run tauri:dev
echo.
echo Process ended. Exit code: %ERRORLEVEL%
echo.
pause
