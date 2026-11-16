@echo off
REM Stockroom: inventory control for small offices
REM Author: Leroy George <georgeleroy.1997@gmail.com>, MIT License
title Stockroom Inventory Server
cd /d "%~dp0"

echo ============================================
echo  Stockroom Inventory Server - starting up
echo ============================================
echo.

where python >nul 2>nul
if errorlevel 1 goto nopython

if exist venv\Scripts\python.exe goto runserver

echo First-time setup: creating virtual environment...
python -m venv venv
if errorlevel 1 goto venvfail

echo Installing required packages ^(needs internet this one time^)...
venv\Scripts\pip install -r requirements.txt
if errorlevel 1 goto pipfail

:runserver
echo.
echo Launching server. Leave this window open while you use the app.
echo.
venv\Scripts\python app.py
echo.
echo The server has stopped.
pause
goto :eof

:nopython
echo ERROR: Python was not found on this computer.
echo.
echo Install it from https://python.org - during setup, tick the box
echo "Add python.exe to PATH", then double-click this file again.
pause
goto :eof

:venvfail
echo ERROR: Could not create the virtual environment.
echo Make sure Python installed correctly, then try again.
pause
goto :eof

:pipfail
echo ERROR: Could not install required packages.
echo Check your internet connection, then try again.
pause
goto :eof
