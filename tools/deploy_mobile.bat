@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

rem ============================================================
rem Struct-LaTeX build & deploy to mobile Obsidian over ADB (Wi-Fi / USB)
rem Usage:
rem   deploy_mobile.bat                     build and deploy to /storage/emulated/0/Documents/Obsidian
rem   deploy_mobile.bat --serial ip:port    connect/deploy to a specific ADB device
rem   deploy_mobile.bat --remote <path>     override Android Obsidian vault/root path
rem   deploy_mobile.bat --skip-build        skip npm run build and push existing artifacts
rem   deploy_mobile.bat --no-pause          exit without pausing
rem ============================================================

set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."
for %%i in ("%ROOT%") do set "ROOT=%%~fi"

set "PLUGIN_ID=struct-latex"
set "REMOTE_BASE=/storage/emulated/0/Documents/Obsidian"
set "NO_PAUSE=0"
set "SKIP_BUILD=0"
set "TARGET="

:parse
if "%~1"=="" goto after_parse
if /i "%~1"=="--no-pause" (
  set "NO_PAUSE=1"
  shift
  goto parse
)
if /i "%~1"=="--skip-build" (
  set "SKIP_BUILD=1"
  shift
  goto parse
)
if /i "%~1"=="--serial" (
  set "TARGET=%~2"
  shift
  shift
  goto parse
)
if /i "%~1"=="--remote" (
  set "REMOTE_BASE=%~2"
  shift
  shift
  goto parse
)
if not defined TARGET (
  set "TARGET=%~1"
  shift
  goto parse
)
echo [错误] 未知参数: %~1
goto fail

:after_parse
if "%REMOTE_BASE:~-1%"=="/" set "REMOTE_BASE=%REMOTE_BASE:~0,-1%"

set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
if not exist "%ADB%" (
  where adb >nul 2>nul
  if errorlevel 1 (
    echo [错误] 未找到 adb，请确认 Android SDK Platform-Tools 已安装。
    goto fail
  )
  set "ADB=adb"
)

if "%SKIP_BUILD%"=="0" (
  echo [1/3] 正在构建 Struct-LaTeX ...
  pushd "%ROOT%"
  call npm run build
  set "BUILD_ERR=!errorlevel!"
  popd
  if not "!BUILD_ERR!"=="0" (
    echo [错误] 构建失败，已终止部署。
    goto fail
  )
) else (
  echo [1/3] 已跳过构建，使用现有构建产物。
)

for %%f in (manifest.json main.js styles.css) do (
  if not exist "%ROOT%\%%f" (
    echo [错误] 缺少构建产物: %ROOT%\%%f
    goto fail
  )
)

echo [2/3] 正在检查手机 ADB 连接 ...
set "SERIAL="
if defined TARGET (
  echo 正在连接设备 %TARGET% ...
  if not "!TARGET::=!"=="!TARGET!" "%ADB%" connect "%TARGET%"
  set "SERIAL=%TARGET%"
) else (
  call "%SCRIPT_DIR%wifi_adb.bat" --no-pause
  for /f "skip=1 tokens=1,2" %%a in ('"%ADB%" devices') do (
    if /i "%%b"=="device" (
      set "SER=%%a"
      if not "!SER::=!"=="!SER!" (
        if /i not "!SER:~0,8!"=="emulator" if not defined SERIAL set "SERIAL=!SER!"
      )
    )
  )
  if not defined SERIAL (
    for /f "skip=1 tokens=1,2" %%a in ('"%ADB%" devices') do (
      if /i "%%b"=="device" (
        set "SER=%%a"
        if /i not "!SER:~0,8!"=="emulator" if not defined SERIAL set "SERIAL=!SER!"
      )
    )
  )
)

if not defined SERIAL (
  echo [错误] 未找到已连接的手机 ADB 设备。
  echo         请先通过 USB 连接手机，或运行 tools\wifi_adb.bat --pair ^<ip:port^> ^<配对码^> 配对无线调试。
  goto fail
)
echo   使用设备: %SERIAL%

echo [3/3] 正在扫描并推送插件到 %REMOTE_BASE% ...
set "DEPLOY_COUNT=0"

for /f "usebackq delims=" %%d in (`"%ADB%" -s %SERIAL% shell ls -1d '%REMOTE_BASE%/.obsidian/' '%REMOTE_BASE%'/*/.obsidian/ 2^>nul`) do (
  call :push_to_obsidian "%%d"
  if errorlevel 1 goto fail
)

if "%DEPLOY_COUNT%"=="0" (
  echo [错误] 在 %REMOTE_BASE% 下未找到任何 .obsidian 目录。
  echo         当前目录内容:
  "%ADB%" -s "%SERIAL%" shell "ls -la '%REMOTE_BASE%'"
  echo         请确认手机 Obsidian 仓库路径，或通过 --remote ^<手机仓库路径^> 指定。
  goto fail
)

echo [完成] 已成功推送到手机端 %DEPLOY_COUNT% 个 Obsidian 仓库（请在手机端 Obsidian 重载或开关插件生效）。
if "%NO_PAUSE%"=="0" pause
exit /b 0

:push_to_obsidian
set "OBS_DIR=%~1"
if "!OBS_DIR:~-1!"=="/" set "OBS_DIR=!OBS_DIR:~0,-1!"
set "REM_PLUGIN=%OBS_DIR%/plugins/%PLUGIN_ID%"
"%ADB%" -s "%SERIAL%" shell "mkdir -p '%REM_PLUGIN%'"
if errorlevel 1 (
  echo [错误] 无法在手机端创建目录: %REM_PLUGIN%
  exit /b 1
)
"%ADB%" -s "%SERIAL%" push "%ROOT%\manifest.json" "%REM_PLUGIN%/manifest.json"
if errorlevel 1 goto push_err
"%ADB%" -s "%SERIAL%" push "%ROOT%\main.js" "%REM_PLUGIN%/main.js"
if errorlevel 1 goto push_err
"%ADB%" -s "%SERIAL%" push "%ROOT%\styles.css" "%REM_PLUGIN%/styles.css"
if errorlevel 1 goto push_err
set /a DEPLOY_COUNT+=1
echo   - 已推送: %REM_PLUGIN%
exit /b 0

:push_err
echo [错误] 推送插件文件失败: %REM_PLUGIN%
exit /b 1

:fail
if "%NO_PAUSE%"=="0" pause
exit /b 1
