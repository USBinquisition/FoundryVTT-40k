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
set "STAGING_DIR=%BUILD_DIR%\staging"
set "ZIP_NAME=%RELEASE_VERSION%USB.zip"

if exist "%STAGING_DIR%" rmdir /s /q "%STAGING_DIR%"
mkdir "%STAGING_DIR%"

mkdir "%STAGING_DIR%\template"
mkdir "%STAGING_DIR%\logo"
mkdir "%STAGING_DIR%\lang"
mkdir "%STAGING_DIR%\css"
mkdir "%STAGING_DIR%\script"
mkdir "%STAGING_DIR%\sript"
mkdir "%STAGING_DIR%\sheet"
mkdir "%STAGING_DIR%\common"
mkdir "%STAGING_DIR%\asset"
mkdir "%STAGING_DIR%\assset"

xcopy /E /I /Y "%ROOT%\template" "%STAGING_DIR%\template"
xcopy /E /I /Y "%ROOT%\logo" "%STAGING_DIR%\logo"
xcopy /E /I /Y "%ROOT%\lang" "%STAGING_DIR%\lang"
xcopy /E /I /Y "%ROOT%\asset" "%STAGING_DIR%\asset"
xcopy /E /I /Y "%ROOT%\asset" "%STAGING_DIR%\assset"
xcopy /E /I /Y "%ROOT%\script" "%STAGING_DIR%\script"
xcopy /E /I /Y "%ROOT%\script\sheet" "%STAGING_DIR%\sheet"
xcopy /E /I /Y "%ROOT%\script\common" "%STAGING_DIR%\common"
xcopy /E /I /Y "%ROOT%\release\css" "%STAGING_DIR%\css"

copy /Y "%ROOT%\release\script\dark-heresy.js" "%STAGING_DIR%\script\dark-heresy.js"
copy /Y "%ROOT%\script\jquery-3.7.1.min.js" "%STAGING_DIR%\script\jquery-3.7.1.min.js"

xcopy /E /I /Y "%STAGING_DIR%\script" "%STAGING_DIR%\sript"

copy /Y "%ROOT%\template.json" "%STAGING_DIR%\template.json"
copy /Y "%ROOT%\system.json" "%STAGING_DIR%\system.json"
copy /Y "%ROOT%\README.md" "%STAGING_DIR%\readme.md"
copy /Y "%ROOT%\LICENSE" "%STAGING_DIR%\License"
copy /Y "%ROOT%\CONTRIBUTING.md" "%STAGING_DIR%\contributing.md"

if exist "%BUILD_DIR%\%ZIP_NAME%" del /f /q "%BUILD_DIR%\%ZIP_NAME%"

powershell -Command "Compress-Archive -Path '%STAGING_DIR%\\*' -DestinationPath '%BUILD_DIR%\\%ZIP_NAME%' -Force"

copy /Y "%ROOT%\system.json" "%BUILD_DIR%\system.json"

rmdir /s /q "%STAGING_DIR%"

popd

echo Release build complete: %BUILD_DIR%\%ZIP_NAME%
endlocal
