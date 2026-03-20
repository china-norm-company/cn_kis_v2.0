@echo off
chcp 65001 >nul
set "PATH=%APPDATA%\npm;%ProgramFiles%\nodejs;%PATH%"
cd /d d:\git_project\cn_kis_v1.0
echo 正在启动接待台...
echo.
pnpm dev:reception
pause
