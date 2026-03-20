#!/usr/bin/env python3
"""
KIS 测量启动器 — 在本机运行，供飞书工作台「开始测量」时由前端调用，自动启动本机 SADC。
KIS 按固定路径查找 SADC：系统盘 Program Files 下的「衡技测量工作台」。

用法：
  1) 将「衡技测量工作台」安装到固定路径：C:\\Program Files\\衡技测量工作台（或本机 Program Files 对应目录）
  2) 运行本脚本（可设为开机自启，见 add_sadc_launcher_to_startup.bat）
  3) 在飞书点「开始测量」时，启动器按固定路径启动 SADC，无需再配置

若需自定义路径，可在启动器同目录下创建 sadc_path.txt，内容一行写绝对路径，优先于固定路径。
"""
import json
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

HOST = "127.0.0.1"
PORT = 18765
SADC_SCRIPT_DIR = Path(__file__).resolve().parent

# SADC 固定安装路径：系统盘 Program Files 下，KIS 按此路径抓
PROGRAM_FILES = os.environ.get("ProgramFiles", "C:\\Program Files")
SADC_FIXED_DIR = Path(PROGRAM_FILES) / "衡技测量工作台"


def get_sadc_dir() -> str | None:
    """获取 SADC 根目录：优先 sadc_path.txt，否则固定路径 C:\\Program Files\\衡技测量工作台，否则脚本所在目录。"""
    path_file = SADC_SCRIPT_DIR / "sadc_path.txt"
    if path_file.exists():
        raw = path_file.read_text(encoding="utf-8").strip()
        if raw:
            p = Path(raw).resolve()
            if p.is_dir() and (p / "app.py").exists():
                return str(p)
    if SADC_FIXED_DIR.is_dir() and (SADC_FIXED_DIR / "app.py").exists():
        return str(SADC_FIXED_DIR)
    app_py = SADC_SCRIPT_DIR / "app.py"
    if app_py.exists():
        return str(SADC_SCRIPT_DIR)
    return None


def start_sadc() -> tuple[bool, str]:
    sadc_dir = get_sadc_dir()
    if not sadc_dir:
        return False, f"未找到 SADC：请将「衡技测量工作台」安装到 {SADC_FIXED_DIR}，或创建 sadc_path.txt 指定路径"
    app_py = Path(sadc_dir) / "app.py"
    if not app_py.exists():
        return False, f"目录内未找到 app.py：{sadc_dir}"
    try:
        subprocess.Popen(
            [sys.executable, "app.py"],
            cwd=sadc_dir,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" and hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        return True, ""
    except Exception as e:
        return False, str(e)


def _send_cors_headers(handler: BaseHTTPRequestHandler) -> None:
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")


class LauncherHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        _send_cors_headers(self)
        self.end_headers()

    def do_GET(self):
        if self.path == "/health" or self.path == "/health/":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            _send_cors_headers(self)
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            return
        if self.path == "/start" or self.path == "/start/":
            ok, err = start_sadc()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            _send_cors_headers(self)
            self.end_headers()
            body = {"ok": ok, "msg": err} if err else {"ok": True}
            self.wfile.write(json.dumps(body, ensure_ascii=False).encode("utf-8"))
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        pass  # 静默，避免刷屏


def main():
    silent = "--silent" in sys.argv or "-s" in sys.argv
    server = HTTPServer((HOST, PORT), LauncherHandler)
    if not silent:
        print(f"KIS 测量启动器已启动：http://{HOST}:{PORT}  （请勿关闭本窗口；在飞书工作台点「开始测量」即可由本机启动 SADC）")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        if not silent:
            print("\n已退出")
        server.shutdown()


if __name__ == "__main__":
    main()
