@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Xlover - Cloudflare 快速临时隧道（无需注册）
cd /d "%~dp0"

echo.
echo ============================================================
echo   Xlover 后端 - Cloudflare 快速临时隧道
echo   （无需注册/无需域名，自动分配公网地址！）
echo ============================================================
echo.
echo   用途：1 分钟内让手机 App 从外网访问你电脑上的后端。
echo   原理：本地 3000 端口  ──Cloudflare Tunnel──▶  公网 https://xxx.trycloudflare.com
echo.
echo   注意：每次重新启动隧道域名都会变！适合临时测试/演示。
echo   如需固定永久域名，请用 01+02 脚本走正式托管模式。
echo.

REM ---------- 1. 找 / 下载 cloudflared ----------
set "EXE=%~dp0cloudflared.exe"
if not exist "%EXE%" (
    echo [1/3] 未找到 cloudflared.exe，开始自动下载最新版...
    echo       下载地址: https://github.com/cloudflare/cloudflared/releases/latest
    echo.
    powershell -NoProfile -Command ^
        "$ProgressPreference='SilentlyContinue';" ^
        "$url='https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';" ^
        "Write-Host '  正在下载，请耐心等待...';" ^
        "Invoke-WebRequest -Uri $url -OutFile '%EXE%' -UseBasicParsing;" ^
        "if (!(Test-Path '%EXE%')) { Write-Host '❌ 下载失败，请手动下载放到本目录：' -ForegroundColor Red; Write-Host '   '$url; pause; exit 1 }"
    if errorlevel 1 (
        echo.
        echo ❌ 自动下载失败。请手动访问：
        echo    https://github.com/cloudflare/cloudflared/releases
        echo    下载 cloudflared-windows-amd64.exe 改名为 cloudflared.exe 放到：
        echo    %~dp0
        echo.
        pause
        exit /b 1
    )
    echo ✅ cloudflared.exe 下载完成！
    echo.
) else (
    echo [1/3] ✅ 找到 cloudflared.exe
)

REM ---------- 2. 检查后端是否已启动（健康检查）----------
echo [2/3] 检查本地后端服务 http://127.0.0.1:3000/health ...
powershell -NoProfile -Command ^
    "try { $r=Invoke-RestMethod -Uri 'http://127.0.0.1:3000/health' -TimeoutSec 3; Write-Host '  ✅ 后端服务运行正常，status='$r.status' onlineUsers='$r.onlineUsers -ForegroundColor Green } catch { Write-Host '  ⚠️  本地 3000 端口没有响应！' -ForegroundColor Yellow; Write-Host '     请先在【Xlover启动器】中点▶启动后台服务，然后再运行本脚本。' -ForegroundColor Yellow }"
echo.

REM ---------- 3. 启动临时隧道 ----------
echo [3/3] 🚀 启动 Cloudflare 快速隧道（trycloudflare.com 模式）...
echo       启动成功后，从下方输出中复制 "Your quick Tunnel has been created! Visit it at (xx):"
echo       后面那串 https://xxx.trycloudflare.com 就是你的公网地址，粘贴到 App 的服务器地址栏。
echo.
echo ============================================================
echo   按 Ctrl+C 关闭隧道
echo ============================================================
echo.

"%EXE%" tunnel --url http://127.0.0.1:3000 --no-autoupdate
pause
