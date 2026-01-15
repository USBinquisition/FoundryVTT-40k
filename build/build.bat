@echo off
setlocal enabledelayedexpansion

set "ROOT=%~dp0.."
set "DEFAULT_VERSION=0.5"

set /p "RELEASE_VERSION=Enter release version (default %DEFAULT_VERSION%): "
if "%RELEASE_VERSION%"=="" set "RELEASE_VERSION=%DEFAULT_VERSION%"

pushd "%ROOT%"

if not exist "node_modules\gulp" (
  echo Installing npm dependencies...
  npm install
  if errorlevel 1 exit /b 1
)

echo Building assets with gulp...
call npx gulp buildAll
if errorlevel 1 exit /b 1

set "BUILD_DIR=%ROOT%\build"
set "RELEASE_DIR=%BUILD_DIR%\release"
set "ZIP_NAME=%RELEASE_VERSION%USB.zip"

if exist "%RELEASE_DIR%" rmdir /s /q "%RELEASE_DIR%"
mkdir "%RELEASE_DIR%"

mkdir "%RELEASE_DIR%\template"
mkdir "%RELEASE_DIR%\logo"
mkdir "%RELEASE_DIR%\lang"
mkdir "%RELEASE_DIR%\css"
mkdir "%RELEASE_DIR%\script"
mkdir "%RELEASE_DIR%\sript"
mkdir "%RELEASE_DIR%\sheet"
mkdir "%RELEASE_DIR%\common"
mkdir "%RELEASE_DIR%\asset"
mkdir "%RELEASE_DIR%\assset"

xcopy /E /I /Y "%ROOT%\template" "%RELEASE_DIR%\template"
xcopy /E /I /Y "%ROOT%\logo" "%RELEASE_DIR%\logo"
xcopy /E /I /Y "%ROOT%\lang" "%RELEASE_DIR%\lang"
xcopy /E /I /Y "%ROOT%\asset" "%RELEASE_DIR%\asset"
xcopy /E /I /Y "%ROOT%\asset" "%RELEASE_DIR%\assset"
xcopy /E /I /Y "%ROOT%\script" "%RELEASE_DIR%\script"
xcopy /E /I /Y "%ROOT%\script\sheet" "%RELEASE_DIR%\sheet"
xcopy /E /I /Y "%ROOT%\script\common" "%RELEASE_DIR%\common"
if exist "%ROOT%\packs" xcopy /E /I /Y "%ROOT%\packs" "%RELEASE_DIR%\packs"
if exist "%ROOT%\release\css" xcopy /E /I /Y "%ROOT%\release\css" "%RELEASE_DIR%\css"

if exist "%ROOT%\release\script\dark-heresy.js" copy /Y "%ROOT%\release\script\dark-heresy.js" "%RELEASE_DIR%\script\dark-heresy.js"
copy /Y "%ROOT%\script\jquery-3.7.1.min.js" "%RELEASE_DIR%\script\jquery-3.7.1.min.js"

xcopy /E /I /Y "%RELEASE_DIR%\script" "%RELEASE_DIR%\sript"

copy /Y "%ROOT%\template.json" "%RELEASE_DIR%\template.json"
copy /Y "%ROOT%\system.json" "%RELEASE_DIR%\system.json"
copy /Y "%ROOT%\README.md" "%RELEASE_DIR%\readme.md"
copy /Y "%ROOT%\LICENSE" "%RELEASE_DIR%\License"
copy /Y "%ROOT%\CONTRIBUTING.md" "%RELEASE_DIR%\contributing.md"

if exist "%BUILD_DIR%\%ZIP_NAME%" del /f /q "%BUILD_DIR%\%ZIP_NAME%"

powershell -Command "Compress-Archive -Path '%RELEASE_DIR%\\*' -DestinationPath '%BUILD_DIR%\\%ZIP_NAME%' -Force"

copy /Y "%ROOT%\system.json" "%BUILD_DIR%\system.json"

popd

echo Release build complete: %BUILD_DIR%\%ZIP_NAME%
endlocal
