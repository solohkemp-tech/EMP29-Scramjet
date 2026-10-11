@echo off
setlocal
cd /d "%~dp0emp29"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci --omit=dev --ignore-scripts
  if errorlevel 1 (
    echo Dependency installation failed. Check the internet connection and npm registry access.
    pause
    exit /b 1
  )
)
echo Open http://localhost:3030 in your browser after the server starts.
echo Close this window or press Ctrl+C to stop EMP29.
call npm start
pause
