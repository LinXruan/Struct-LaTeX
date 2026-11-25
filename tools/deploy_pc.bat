@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

rem ============================================================
rem Struct-LaTeX build & deploy to local PC Obsidian vaults
rem Usage:
rem   deploy_pc.bat                     build and deploy to registered local vaults
rem   deploy_pc.bat --vault <path>      deploy to a specific Obsidian vault
rem   deploy_pc.bat --skip-build        skip npm run build and copy existing artifacts
rem   deploy_pc.bat --no-pause          exit without pausing
rem ============================================================

set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."
for %%i in ("%ROOT%") do set "ROOT=%%~fi"

set "PLUGIN_ID=struct-latex"
set "NO_PAUSE=0"
set "SKIP_BUILD=0"
set "TARGET_VAULT="

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
if /i "%~1"=="--vault" (
  set "TARGET_VAULT=%~2"
  shift
  shift
  goto parse
)
if not defined TARGET_VAULT (
  set "TARGET_VAULT=%~1"
  shift
  goto parse
)
echo [错误] 未知参数: %~1
goto fail

:after_parse
if "%SKIP_BUILD%"=="0" (
  echo [1/2] 正在构建 Struct-LaTeX ...
  pushd "%ROOT%"
  call npm run build
  set "BUILD_ERR=!errorlevel!"
  popd
  if not "!BUILD_ERR!"=="0" (
    echo [错误] 构建失败，已终止部署。
    goto fail
  )
) else (
  echo [1/2] 已跳过构建，使用现有构建产物。
)

for %%f in (manifest.json main.js styles.css) do (
  if not exist "%ROOT%\%%f" (
    echo [错误] 缺少构建产物: %ROOT%\%%f
    goto fail
  )
)

echo [2/2] 正在部署到本机 Obsidian 插件目录 ...
set "DEPLOY_COUNT=0"

if defined TARGET_VAULT (
  if not exist "%TARGET_VAULT%\.obsidian" (
    echo [错误] 目标目录不是有效的 Obsidian 仓库（缺少 .obsidian）: %TARGET_VAULT%
    goto fail
  )
  call :copy_to_vault "%TARGET_VAULT%"
  if errorlevel 1 goto fail
) else (
  for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $cfg=Join-Path $env:APPDATA 'obsidian\obsidian.json'; if(Test-Path $cfg){ $j=Get-Content $cfg -Raw | ConvertFrom-Json; $j.vaults.PSObject.Properties | ForEach-Object { $p=$_.Value.path; if($p -and (Test-Path (Join-Path $p '.obsidian'))){ $p } } }"`) do (
    call :copy_to_vault "%%v"
    if errorlevel 1 goto fail
  )
  if "!DEPLOY_COUNT!"=="0" (
    set "FALLBACK_VAULT=%USERPROFILE%\Desktop\TestObsidian"
    if exist "!FALLBACK_VAULT!\.obsidian" (
      call :copy_to_vault "!FALLBACK_VAULT!"
      if errorlevel 1 goto fail
    )
  )
)

if "%DEPLOY_COUNT%"=="0" (
  echo [错误] 未找到可用的本机 Obsidian 仓库，可使用 --vault ^<仓库路径^> 手动指定。
  goto fail
)

echo [完成] 已成功部署到 %DEPLOY_COUNT% 个本机 Obsidian 仓库（请在 Obsidian 中重载插件或开关插件生效）。
if "%NO_PAUSE%"=="0" pause
exit /b 0

:copy_to_vault
set "VAULT_DIR=%~1"
set "PLUGIN_DIR=%VAULT_DIR%\.obsidian\plugins\%PLUGIN_ID%"
if not exist "%PLUGIN_DIR%" mkdir "%PLUGIN_DIR%" >nul 2>nul
if errorlevel 1 (
  echo [错误] 无法创建插件目录: %PLUGIN_DIR%
  exit /b 1
)
copy /y "%ROOT%\manifest.json" "%PLUGIN_DIR%\manifest.json" >nul
if errorlevel 1 goto copy_err
copy /y "%ROOT%\main.js" "%PLUGIN_DIR%\main.js" >nul
if errorlevel 1 goto copy_err
copy /y "%ROOT%\styles.css" "%PLUGIN_DIR%\styles.css" >nul
if errorlevel 1 goto copy_err
set /a DEPLOY_COUNT+=1
echo   - 已部署: %PLUGIN_DIR%
exit /b 0

:copy_err
echo [错误] 复制插件文件失败: %PLUGIN_DIR%
exit /b 1

:fail
if "%NO_PAUSE%"=="0" pause
exit /b 1
