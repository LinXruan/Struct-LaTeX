@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

rem ============================================================
rem Struct-LaTeX wireless ADB helper
rem Usage:
rem   wifi_adb.bat                     connect via USB, mDNS, or saved address
rem   wifi_adb.bat --list              list adb devices
rem   wifi_adb.bat --serial ip:port    connect to a specific address
rem   wifi_adb.bat --pair ip:port code pair Android 11+ wireless debugging
rem   wifi_adb.bat --port 5555         tcpip port (default 5555)
rem ============================================================

set "NO_PAUSE=0"
set "DO_LIST=0"
set "TARGET="
set "PAIR_ADDR="
set "PAIR_CODE="
set "PORT=5555"
set "STATE_FILE=%LOCALAPPDATA%\Struct-LaTeX\wifi_adb.txt"

:parse
if "%~1"=="" goto after_parse
if /i "%~1"=="--no-pause" (
  set "NO_PAUSE=1"
  shift
  goto parse
)
if /i "%~1"=="--list" (
  set "NO_PAUSE=1"
  set "DO_LIST=1"
  shift
  goto parse
)
if /i "%~1"=="--serial" (
  set "TARGET=%~2"
  shift
  shift
  goto parse
)
if /i "%~1"=="--port" (
  set "PORT=%~2"
  shift
  shift
  goto parse
)
if /i "%~1"=="--pair" (
  set "PAIR_ADDR=%~2"
  set "PAIR_CODE=%~3"
  shift
  shift
  shift
  goto parse
)
if not defined TARGET set "TARGET=%~1"
shift
goto parse

:after_parse
set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
if not exist "%ADB%" (
  where adb >nul 2>nul
  if errorlevel 1 (
    echo [错误] 未找到 adb，请确认 Android SDK Platform-Tools 已安装。
    goto fail
  )
  set "ADB=adb"
)

if "%DO_LIST%"=="1" (
  "%ADB%" devices -l
  goto ok
)

if defined PAIR_ADDR (
  if not defined PAIR_CODE (
    echo [错误] 用法: wifi_adb.bat --pair ^<ip:port^> ^<配对码^>
    goto fail
  )
  echo 正在配对 %PAIR_ADDR% ...
  "%ADB%" pair "%PAIR_ADDR%" "%PAIR_CODE%"
  if errorlevel 1 goto fail
  goto ok
)

if defined TARGET (
  echo 正在连接 %TARGET% ...
  "%ADB%" connect "%TARGET%"
  goto verify
)

rem 1) Reuse an already connected wireless device.
call :find_wifi_serial
if defined WIFI_SERIAL (
  echo [就绪] 无线设备: !WIFI_SERIAL!
  goto ok
)

rem 2) Reconnect the last known address.
if exist "%STATE_FILE%" (
  set /p SAVED=<"%STATE_FILE%"
  if defined SAVED (
    echo 正在重连上次的无线地址 !SAVED! ...
    "%ADB%" connect "!SAVED!" >nul 2>nul
    call :find_wifi_serial
    if defined WIFI_SERIAL (
      echo [完成] 无线 ADB 已就绪: !WIFI_SERIAL!
      goto ok
    )
  )
)

rem 3) Discover already-paired wireless ADB services via mDNS.
rem    Prefer _adb._tcp (fixed port 5555), then _adb-tls-connect._tcp (Android 11+ dynamic port).
for %%s in (_adb._tcp _adb-tls-connect._tcp) do (
  for /f "skip=1 delims=" %%l in ('"%ADB%" mdns services 2^>nul') do (
    if not defined WIFI_SERIAL (
      set "MLINE=%%l"
      if not "!MLINE:%%s=!"=="!MLINE!" (
        set "MADDR="
        for %%t in (%%l) do set "MADDR=%%t"
        if defined MADDR (
          echo 发现 mDNS 无线调试服务 !MADDR! ，正在尝试连接 ...
          "%ADB%" connect "!MADDR!" >nul 2>nul
          call :find_wifi_serial
        )
      )
    )
  )
)
if defined WIFI_SERIAL goto verify

rem 4) Switch a USB device to wireless ADB.
set "USB_SERIAL="
for /f "skip=1 tokens=1,2" %%a in ('"%ADB%" devices') do (
  if /i "%%b"=="device" (
    set "SER=%%a"
    if "!SER::=!"=="!SER!" (
      if /i not "!SER:~0,8!"=="emulator" set "USB_SERIAL=!SER!"
    )
  )
)

if defined USB_SERIAL (
  echo 正在从 USB 设备 !USB_SERIAL! 切换到无线 ADB ...
  set "IP="
  for /f "tokens=2" %%i in ('"%ADB%" -s "!USB_SERIAL!" shell ip -f inet addr show wlan0 2^>nul ^| findstr /r /c:"inet "') do (
    if not defined IP set "IP=%%i"
  )
  if defined IP for /f "tokens=1 delims=/" %%j in ("!IP!") do set "IP=%%j"
  if not defined IP (
    for /f "delims=" %%i in ('"%ADB%" -s "!USB_SERIAL!" shell getprop dhcp.wlan0.ipaddress 2^>nul') do set "IP=%%i"
  )
  if not defined IP (
    echo [错误] 无法读取设备 Wi-Fi IP，请确认设备已连接 Wi-Fi。
    echo         也可使用 --serial ^<ip:port^> 手动指定地址。
    goto fail
  )

  echo 设备 IP: !IP!
  "%ADB%" -s "!USB_SERIAL!" tcpip %PORT%
  if errorlevel 1 goto fail
  ping -n 4 127.0.0.1 >nul
  "%ADB%" connect "!IP!:%PORT%"
  goto verify
)

:verify
call :find_wifi_serial
if defined WIFI_SERIAL (
  if not exist "%LOCALAPPDATA%\Struct-LaTeX" mkdir "%LOCALAPPDATA%\Struct-LaTeX" >nul 2>nul
  > "%STATE_FILE%" echo !WIFI_SERIAL!
  echo [完成] 无线 ADB 已就绪: !WIFI_SERIAL!
  goto ok
)

echo [错误] 未能建立无线 ADB 连接。
echo         首次使用请用 USB 连接后运行本脚本; Android 11+ 也可先用 --pair 配对。
goto fail

:find_wifi_serial
set "WIFI_SERIAL="
for /f "skip=1 tokens=1,2" %%a in ('"%ADB%" devices') do (
  if /i "%%b"=="device" (
    set "SER=%%a"
    if not "!SER::=!"=="!SER!" (
      if /i not "!SER:~0,8!"=="emulator" if not defined WIFI_SERIAL set "WIFI_SERIAL=!SER!"
    )
  )
)
exit /b 0

:ok
if "%NO_PAUSE%"=="0" pause
exit /b 0

:fail
if "%NO_PAUSE%"=="0" pause
exit /b 1
