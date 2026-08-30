@echo off
chcp 65001 >nul
title Xlover - Cloudflare Tunnel 登录与授权向导
cd /d "%~dp0"

echo.
echo ============================================================
echo   Xlover 后端 - Cloudflare Zero Trust 登录授权
echo ============================================================
echo.
echo   此步骤只需要做一次！用于把 cloudflared.exe 绑定到你的 Cloudflare 账号。
echo   完成后你就可以用 02-启动正式隧道.bat 实现固定域名永久运行。
echo.

set "EXE=%~dp0cloudflared.exe"
if not exist "%EXE%" (
    echo ❌ 找不到 cloudflared.exe，请先运行 00-快速临时隧道.bat（会自动下载）
    pause
    exit /b 1
)

echo [1/2] 请在弹出的浏览器页面中登录 Cloudflare 账号并授权...
echo.
"%EXE%" tunnel login
echo.
if errorlevel 1 (
    echo ❌ 登录失败。如果网络原因卡住，可以：
    echo    1. 科学上网后重试
    echo    2. 或手动访问 https://dash.cloudflare.com/ 登录后再运行本脚本
    echo.
    pause
    exit /b 1
)

echo.
echo [2/2] ✅ 登录成功！现在创建一个名为【xlover-backend】的隧道...
echo.
"%EXE%" tunnel create xlover-backend
echo.
echo ============================================================
echo   1. 上方黄色/绿色日志会显示一个 Tunnel ID（UUID 格式）
echo   2. 去 Cloudflare Zero Trust 控制台：
echo      https://one.dash.cloudflare.com/ → Networks → Tunnels
echo      找到 xlover-backend → 点 Configure → Public Hostname
echo      新增一条:  Subdomain = xlover   Domain = 你的域名
echo                Type = HTTP   URL = localhost:3000
echo   3. 回到本目录，用记事本打开【config.yml】
echo      把 tunnel: 和 credentials-file: 两行改成你刚才的值
echo   4. 双击 02-启动正式隧道.bat
echo ============================================================
echo.
pause
