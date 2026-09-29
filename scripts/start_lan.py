"""Start the computer-hosted edition for macOS, Windows, and LAN browsers."""

import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen
import webbrowser

from prepare_lan import ROOT, prepare_lan_secrets


def _port_available(port: int) -> bool:
    with socket.socket() as listener:
        try:
            listener.bind(("0.0.0.0", port))
            return True
        except OSError:
            return False


def _local_ip() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("192.0.2.1", 80))
            return probe.getsockname()[0]
    except OSError:
        return None


def _build_frontend() -> None:
    frontend = ROOT / "frontend"
    build_env = os.environ.copy()
    build_env["VITE_API_BASE_URL"] = ""  # Same-origin API is required on phones.
    npm = shutil.which("npm")
    if npm:
        subprocess.run([npm, "run", "build"], cwd=frontend, env=build_env, check=True)
        return
    bundled_node = Path("/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node")
    node = shutil.which("node") or (str(bundled_node) if bundled_node.is_file() else None)
    tsc = frontend / "node_modules" / "typescript" / "bin" / "tsc"
    vite = frontend / "node_modules" / "vite" / "bin" / "vite.js"
    if node and tsc.is_file() and vite.is_file():
        subprocess.run([node, str(tsc), "-b"], cwd=frontend, env=build_env, check=True)
        subprocess.run([node, str(vite), "build"], cwd=frontend, env=build_env, check=True)
        return
    raise RuntimeError("缺少 Node.js 或前端依赖。请先安装 Node.js，并在 frontend 运行 npm install")


def main() -> None:
    port = int(os.environ.get("APP_PORT", "8003"))
    if not 1 <= port <= 65535:
        raise RuntimeError("APP_PORT 必须是有效端口")
    if not _port_available(port):
        raise RuntimeError(f"端口 {port} 已被占用。请先关闭原有考研 Agent 后端，再启动局域网版")
    _build_frontend()
    backend = ROOT / "backend"
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=backend, check=True)
    secrets = prepare_lan_secrets()
    environment = os.environ.copy()
    environment.update(secrets)
    environment.update({"APP_ENV": "lan", "APP_HOST": "0.0.0.0", "APP_PORT": str(port), "SERVE_FRONTEND": "true"})
    local_url = f"http://127.0.0.1:{port}/"
    print(f"电脑：{local_url}", flush=True)
    ip = _local_ip()
    if ip:
        print(f"手机和平板（同一局域网）：http://{ip}:{port}/", flush=True)
    print("仅在可信家庭网络使用；当前局域网连接为 HTTP，请勿在公共 Wi-Fi 或互联网上开放此端口。", flush=True)
    server = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", str(port)], cwd=backend, env=environment)
    try:
        for _ in range(40):
            if server.poll() is not None:
                raise RuntimeError("后端启动失败，请查看上方错误信息")
            try:
                with urlopen(local_url + "api/health", timeout=1) as response:
                    if response.status == 200:
                        break
            except (OSError, URLError):
                time.sleep(0.25)
        else:
            raise RuntimeError("后端未在 10 秒内就绪")
        webbrowser.open(local_url)
        server.wait()
    finally:
        if server.poll() is None:
            server.terminate()
            server.wait(timeout=10)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"启动失败：{error}", file=sys.stderr)
        raise SystemExit(1) from error
