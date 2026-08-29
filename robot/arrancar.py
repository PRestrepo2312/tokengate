"""TOKENGATE sin tocar nada: arranca la página en una ventana de Chrome tipo app (sin barra, micrófono ya concedido,
audio sin clic) + el puente Convex → ESP32. El robot queda escuchando "Hola robot" por el BTS-06 y responde por el BTS-06.

    ..\\Nomi\\.venv\\Scripts\\python robot\\arrancar.py            # desde TOKENGATE/ (con `npm run dev` ya corriendo en web/)
    ..\\Nomi\\.venv\\Scripts\\python robot\\arrancar.py --url https://<amplify>   # con la página publicada
    ..\\Nomi\\.venv\\Scripts\\python robot\\arrancar.py --kiosk                   # pantalla completa (Esc no sale: Alt+F4)

Ctrl+C cierra todo (Chrome y puente).
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent


def chrome() -> str | None:
    candidatos = [
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
    ]
    for c in candidatos:
        if os.path.exists(c):
            return c
    return None


def main() -> int:
    url = sys.argv[sys.argv.index("--url") + 1] if "--url" in sys.argv else "http://localhost:5174/"
    kiosk = "--kiosk" in sys.argv
    navegador = chrome()
    if not navegador:
        print("No encuentro Chrome ni Edge.")
        return 1
    perfil = RAIZ / ".chrome-robot"   # perfil propio: los permisos y flags no tocan tu Chrome normal
    perfil.mkdir(exist_ok=True)
    flags = [
        navegador,
        f"--user-data-dir={perfil}",
        "--use-fake-ui-for-media-stream",          # concede el micrófono sin preguntar
        "--autoplay-policy=no-user-gesture-required",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-session-crashed-bubble",
        "--kiosk" if kiosk else f"--app={url}",
    ]
    if kiosk:
        flags.append(url)
    print("abriendo el robot en", url)
    nav = subprocess.Popen(flags)
    print("arrancando el puente al ESP32...")
    puente = subprocess.Popen([sys.executable, "-u", str(AQUI / "puente.py")], cwd=str(RAIZ))
    print("listo. Di 'Hola robot' cerca del BTS-06. Ctrl+C para cerrar todo.")
    try:
        while True:
            time.sleep(1)
            if puente.poll() is not None:
                print("el puente terminó; lo relanzo en 3 s")
                time.sleep(3)
                puente = subprocess.Popen([sys.executable, "-u", str(AQUI / "puente.py")], cwd=str(RAIZ))
    except KeyboardInterrupt:
        pass
    finally:
        for p in (puente, nav):
            try:
                p.terminate()
            except Exception:  # noqa: BLE001
                pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
