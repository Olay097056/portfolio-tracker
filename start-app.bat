@echo off
REM Double-click this file to start Portfolio Tracker.
REM Opens the backend (FastAPI) and frontend (Vite) each in their own window,
REM then opens the app in your browser once the frontend is ready.

set ROOT=%~dp0

echo Starting Portfolio Tracker...
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo.
echo (Two new windows will open - one for backend, one for frontend.
echo  Closing this window will NOT stop them; close each of those windows
echo  separately when you're done.)
echo.

start "Portfolio Tracker - Backend" cmd /k "cd /d "%ROOT%backend" && call .venv\Scripts\activate.bat && uvicorn app.main:app --reload"

timeout /t 2 /nobreak >nul

start "Portfolio Tracker - Frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

timeout /t 5 /nobreak >nul

start "" "http://localhost:5173"

echo.
echo Done. This window can be closed - the app keeps running in the other two.
pause
