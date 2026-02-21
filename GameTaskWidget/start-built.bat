@echo off
cd /d "%~dp0"

set EXE=src-tauri\target\release\game-task-widget.exe

if not exist "%EXE%" (
    echo Building app...
    call npm run tauri:build
    if errorlevel 1 (
        echo Build failed.
        pause
        exit /b 1
    )
    echo.
)

echo Starting Game Task Widget...
start "" "%EXE%"
