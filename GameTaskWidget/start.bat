@echo off
cd /d "%~dp0"

if not exist "src-tauri\icons\icon.ico" (
    call npm run create-icon 2>nul
)

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

:: Launch without console window
start "" /min cmd /c "npm run tauri:dev"
