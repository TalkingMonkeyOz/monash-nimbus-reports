@echo off
cd /d "C:\Projects\monash-nimbus-reports"
echo Starting Monash Nimbus Reports Development Server...
echo.
echo Note: Port will auto-increment if 1430 is busy (1431, 1432, etc.)
echo Set VITE_PORT environment variable to specify a custom port
echo.
npm run tauri:dev
pause
