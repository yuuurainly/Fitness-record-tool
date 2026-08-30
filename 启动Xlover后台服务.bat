@echo off
chcp 65001 >nul
REM 项目根目录下的快速入口，实际调用 Xlover-Server 下的启动器
cd /d "%~dp0Xlover-Server"
call "启动Xlover服务.bat"
