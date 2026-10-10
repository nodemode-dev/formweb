#!/usr/bin/env python3
import os
import shutil
import socket
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    for name in ("git", "node", "npm", "python3", "cargo"):
        resolved = shutil.which(name)
        if name == "cargo" and not resolved:
            candidate = Path.home() / ".cargo" / "bin" / "cargo"
            resolved = str(candidate) if candidate.is_file() else None
        print(f"{name}: {resolved or 'missing'}")
    paths = [ROOT / "backend" / "venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python"),
             ROOT / "frontend" / "node_modules", ROOT / "frontend" / "dist" / "index.html",
             ROOT / "native" / "target" / "release" / ("formweb-core.exe" if os.name == "nt" else "formweb-core")]
    for path in paths:
        print(f"{path.relative_to(ROOT)}: {'present' if path.exists() else 'missing'}")
    for port in (5240, 5241, 8240):
        with socket.socket() as connection:
            connection.settimeout(0.2)
            busy = connection.connect_ex(("127.0.0.1", port)) == 0
        print(f"127.0.0.1:{port}: {'in use' if busy else 'free'}")
    core = paths[-1]
    if core.is_file():
        result = subprocess.run([str(core), "--version"], capture_output=True, text=True, timeout=5)
        print(f"core version: {result.stdout.strip() or result.stderr.strip()}")


if __name__ == "__main__":
    main()
