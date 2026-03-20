@echo off
chcp 65001 >nul
REM 确保 pnpm 在 PATH 中（CMD 可能未加载 npm 路径）
set "PATH=%APPDATA%\npm;%ProgramFiles%\nodejs;%PATH%"

echo ========================================
echo CN KIS 招募台 + 接待台 启动脚本
echo ========================================
echo.

cd /d d:\git_project\cn_kis_v1.0

REM 检查 pnpm 是否可用
where pnpm >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 pnpm，请先安装 Node.js 和 pnpm
    echo 或在项目目录执行: npm install -g pnpm
    pause
    exit /b 1
)

echo [1/3] 启动招募台 (端口 3009)...
start "招募台" cmd /k "set PATH=%APPDATA%\npm;%ProgramFiles%\nodejs;%PATH% && cd /d d:\git_project\cn_kis_v1.0 && pnpm dev:recruitment"

timeout /t 3 >nul

echo [2/3] 启动接待台 (端口 3016)...
start "接待台" cmd /k "set PATH=%APPDATA%\npm;%ProgramFiles%\nodejs;%PATH% && cd /d d:\git_project\cn_kis_v1.0 && pnpm dev:reception"

echo.
echo [3/3] 若后端未启动，请另开终端执行:
echo   cd d:\git_project\cn_kis_v1.0\backend
echo   set PYTHONUTF8=1
echo   set USE_DUMMY_CACHE=true
echo   python manage.py runserver 8001
echo.
echo 招募台: http://localhost:3009/recruitment/
echo 接待台: http://localhost:3016/reception/
echo （若端口被占用，Vite 会自动换端口，以窗口输出为准）
echo.
pause
