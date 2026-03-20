@echo off
chcp 65001 >nul
setlocal
:: 将 KIS 测量启动器加入当前用户「开机启动」，实现：SADC 只存在、无需每次手动操作、等 KIS 调用即可。
:: 用法：将本脚本与 kis_sadc_launcher.py 放在同一目录（或放在衡技测量工作台目录内），双击本脚本运行一次。

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "LAUNCHER=%SCRIPT_DIR%\kis_sadc_launcher.py"
if not exist "%LAUNCHER%" (
  echo 未找到 kis_sadc_launcher.py，请确保与本脚本在同一目录。
  pause
  exit /b 1
)

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS=%STARTUP%\KIS测量启动器.vbs"
:: 用 VBS 无窗口启动 python 运行启动器（不依赖 pythonw）；路径含空格时 VBS 内用 "" 包裹
(
  echo Set WshShell = CreateObject^("WScript.Shell"^)
  echo WshShell.Run "python """"%LAUNCHER%"""" --silent", 0, False
) > "%VBS%"

if exist "%VBS%" (
  echo 已添加「KIS 测量启动器」到开机启动。
  echo 路径：%VBS%
  echo 下次登录后启动器会在后台运行，在飞书点「开始测量」即可由本机自动启动 SADC，无需再手动操作。
) else (
  echo 创建失败。请手动将「以无窗口方式运行 python %LAUNCHER% --silent」加入启动文件夹：%STARTUP%
)
pause
