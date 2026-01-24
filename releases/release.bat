@echo off
setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set ROOT_DIR=%SCRIPT_DIR%..\

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found on PATH.
  echo Download: https://www.python.org/downloads/windows/
  exit /b 1
)

python "%SCRIPT_DIR%release_tool.py"
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Release helper exited with code %EXIT_CODE%.
)

exit /b %EXIT_CODE%
