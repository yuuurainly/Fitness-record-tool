@echo off
chcp 65001 >nul
title Xlover 后台服务启动器
cd /d "%~dp0"

echo.
echo ========================================
echo    Xlover 后台服务 - 图形化启动器
echo ========================================
echo.

REM 优先使用 Node v20 目录加入 PATH（与 start-menu.ps1 一致）
set "NODE20_DIR=C:\Users\Negen\nodejs"
if exist "%NODE20_DIR%\node.exe" (
    set "PATH=%NODE20_DIR%;%PATH%"
)

REM 查找 Python
set "PYTHON_CMD="
where pyw >nul 2>nul
if %errorlevel%==0 (
    set "PYTHON_CMD=pyw"
    goto :found
)
where pythonw >nul 2>nul
if %errorlevel%==0 (
    set "PYTHON_CMD=pythonw"
    goto :found
)
where python >nul 2>nul
if %errorlevel%==0 (
    set "PYTHON_CMD=python"
    goto :found
)

:notfound
echo.
echo [错误] 未检测到 Python！
echo ====================================
echo 请先安装 Python 3.8 或更高版本：
echo   下载地址: https://www.python.org/downloads/
echo   安装时请务必勾选 "Add Python to PATH"
echo.
echo 安装完成后请重新运行本脚本。
echo ====================================
echo.
pause
exit /b 1

:found
echo [启动器] 使用: %PYTHON_CMD%
echo [启动器] 正在打开图形化界面...
echo.

start "" %PYTHON_CMD% "%~dp0Xlover启动器.pyw"
exit /b 0
