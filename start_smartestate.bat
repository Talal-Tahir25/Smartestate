@echo off
echo ===========================================
echo   Starting SmartEstate AI & Frontend...
echo ===========================================

:: 1. Start Python Backend (in a new window)
:: We cd into 'model' so it finds the .pkl files, then call python from the virtual env
echo Starting Python Model Server...
start "SmartEstate AI Backend" cmd /k "cd model && ..\.venv\Scripts\python.exe app.py"

:: 2. Start Node.js Frontend (in a new window)
echo Starting Node.js Frontend...
start "SmartEstate Web Server" cmd /k "npm start"

:: 3. Open Browser
echo Waiting for servers to initialize...
timeout /t 5
start http://localhost:3000

echo ===========================================
echo   System Running!
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:5000
echo ===========================================
pause
