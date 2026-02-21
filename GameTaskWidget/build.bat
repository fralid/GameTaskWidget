@echo off
cd /d "%~dp0"

echo Building Game Task Widget...
echo.

call npm run tauri:build

if errorlevel 1 (
    echo.
    echo Build failed.
    pause
    exit /b 1
)

echo.
echo Done. EXE: src-tauri\target\release\game-task-widget.exe
pause
