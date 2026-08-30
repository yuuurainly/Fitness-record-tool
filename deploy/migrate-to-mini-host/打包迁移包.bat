@echo off
chcp 65001 >nul
title Xlover 后端 - 打包迁移包

echo ============================================================
echo   Xlover 后端 - 打包迁移到小主机的文件包
echo ============================================================
echo.

REM 获取项目根目录
set "PROJECT_ROOT=%~dp0..\..\.."
pushd "%PROJECT_ROOT%"
set "PROJECT_ROOT=%CD%"
popd

set "SERVER_DIR=%PROJECT_ROOT%\Xlover-Server"
set "MIGRATE_DIR=%PROJECT_ROOT%\deploy\migrate-to-mini-host"
set "OUTPUT_DIR=%PROJECT_ROOT%\deploy"
set "OUTPUT_FILE=%OUTPUT_DIR%\xlover-migrate-package.tar.gz"

echo [项目根目录] %PROJECT_ROOT%
echo [后端目录]   %SERVER_DIR%
echo [迁移文件]   %MIGRATE_DIR%
echo [输出文件]   %OUTPUT_FILE%
echo.

REM 检查关键文件
if not exist "%SERVER_DIR%\package.json" (
    echo ❌ 找不到 package.json：%SERVER_DIR%\package.json
    pause
    exit /b 1
)

if not exist "%SERVER_DIR%\src\index.js" (
    echo ❌ 找不到 src\index.js：%SERVER_DIR%\src\index.js
    pause
    exit /b 1
)

echo [1/4] 清理旧打包文件...
if exist "%OUTPUT_FILE%" del "%OUTPUT_FILE%"
echo     ✅ 完成
echo.

echo [2/4] 检查 tar 命令...
where tar >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 系统没有 tar 命令，请用 Windows 10 1803+ 自带的 tar，或安装 7-Zip
    echo    如果有 7-Zip，可以手动用 7z 压缩成 .tar.gz
    pause
    exit /b 1
)
echo     ✅ tar 可用
echo.

echo [3/4] 正在打包（可能需要 30-60 秒）...
echo     包含内容：
echo     - Xlover-Server\src\         （后端源码）
echo     - Xlover-Server\database\    （含全量数据库）
echo     - Xlover-Server\package.json （依赖清单）
echo     - Xlover-Server\.env         （环境配置）
echo     - Xlover-Server\deploy\migrate-to-mini-host\ （迁移脚本+教程）
echo.

REM 用 tar 打包（Windows 10+ 自带 bsdtar）
REM 排除：node_modules、logs、__pycache__、cloudflared.exe、.bat启动器、GUI
tar -czf "%OUTPUT_FILE%" ^
    -C "%PROJECT_ROOT%" ^
    --exclude="Xlover-Server/node_modules" ^
    --exclude="Xlover-Server/__pycache__" ^
    --exclude="Xlover-Server/logs" ^
    --exclude="Xlover-Server/cloudflared.exe" ^
    --exclude="Xlover-Server/*.bat" ^
    --exclude="Xlover-Server/*.pyw" ^
    --exclude="Xlover-Server/*.log" ^
    --exclude="Xlover-Server/run.err.log" ^
    --exclude="Xlover-Server/run.log" ^
    --exclude="Xlover-Server/smoke-test.js" ^
    --exclude="Xlover-Server/test-api.js" ^
    --exclude="Xlover-Server/verify-schema.js" ^
    --exclude="Xlover-Server/start-menu.ps1" ^
    --exclude="Xlover-Server/database/*.bak*" ^
    --exclude="Xlover-Server/database/*.db-shm" ^
    --exclude="Xlover-Server/database/*.db-wal" ^
    --exclude="deploy/cloudflare-tunnel/cloudflared.exe" ^
    --exclude="deploy/cloudflare-tunnel/tunnel.log" ^
    --exclude="deploy/cloudflare-tunnel/.last-tunnel-url" ^
    Xlover-Server/src ^
    Xlover-Server/database ^
    Xlover-Server/package.json ^
    Xlover-Server/package-lock.json ^
    Xlover-Server/.env ^
    Xlover-Server/.env.example ^
    Xlover-Server/.gitignore ^
    deploy/migrate-to-mini-host

if %errorlevel% neq 0 (
    echo.
    echo ❌ 打包失败！
    pause
    exit /b 1
)

echo     ✅ 打包完成
echo.

echo [4/4] 验证打包结果...
for %%F in ("%OUTPUT_FILE%") do set "FILE_SIZE=%%~zF"
set /a "FILE_MB=FILE_SIZE/1048576"
echo     文件：%OUTPUT_FILE%
echo     大小：%FILE_MB% MB
echo.

echo ============================================================
echo   ✅ 迁移包打包完成！
echo ============================================================
echo.
echo   📦 文件位置：%OUTPUT_FILE%
echo   📏 文件大小：%FILE_MB% MB
echo.
echo   📤 下一步：把这个文件传到小主机
echo.
echo   方法 1（推荐）· 用 scp 传输：
echo     scp "%OUTPUT_FILE%" xlover@小主机IP:~/
echo.
echo   方法 2 · 用 WinSCP（图形化）：
echo     下载 https://winscp.net/ → 连接 → 拖拽文件
echo.
echo   📥 传到小主机后执行：
echo     cd ~
echo     tar xzf xlover-migrate-package.tar.gz
echo     cd Xlover-Server
echo     bash deploy/migrate-to-mini-host/02-环境初始化.sh
echo     bash deploy/migrate-to-mini-host/03-部署后端服务.sh
echo.
echo   📖 完整教程参考：deploy\migrate-to-mini-host\迁移总览.md
echo.
pause
