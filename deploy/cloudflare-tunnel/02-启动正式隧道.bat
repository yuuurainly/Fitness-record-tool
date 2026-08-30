@echo off
chcp 65001 >nul
title Xlover - Cloudflare 正式隧道（固定域名模式）
cd /d "%~dp0"

echo.
echo ============================================================
echo   Xlover 后端 - Cloudflare 正式隧道（固定域名）
echo ============================================================
echo.

set "EXE=%~dp0cloudflared.exe"
set "CFG=%~dp0config.yml"

if not exist "%EXE%" (
    echo ❌ 找不到 cloudflared.exe，请先运行 00-快速临时隧道.bat
    pause
    exit /b 1
)
if not exist "%CFG%" (
    echo ❌ 找不到 %CFG%
    echo    请先运行 01-登录并创建隧道.bat，然后按说明修改 config.yml
    pause
    exit /b 1
)

echo 验证配置文件...
findstr /C:"tunnel:" "%CFG%" | findstr /V "xlover-backend              # ①" >nul
if errorlevel 1 (
    echo ⚠️  config.yml 里还在用模板占位符（未修改 tunnel ID）
    echo    请先打开 config.yml 修改 tunnel / credentials-file / hostname 三处
    echo    或改用 00-快速临时隧道.bat（傻瓜式，无需配置）
    echo.
    pause
    exit /b 1
)

echo ✅ 配置检查通过，开始启动正式隧道...
echo.
echo ============================================================
echo   绑定的域名：在 config.yml 中配置的 hostname
echo   本地后端  ：http://127.0.0.1:3000
echo   关闭方式  ：Ctrl+C
echo ============================================================
echo.

"%EXE%" tunnel --config "%CFG%" run
pause
