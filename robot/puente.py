"""Puente Convex → ESP32 para TOKENGATE: la página (Vapi) escribe `cuerpo.estado`; esto lo lee cada 300 ms por la API HTTP
de Convex y lo manda por serial al ESP32 con el protocolo de LUMI (Nomi/specs/01 §2), que ya tiene la cara y los gestos.

    Nomi\\.venv\\Scripts\\python robot\\puente.py            # desde TOKENGATE/; autodetecta COM (o TOKENGATE_PUERTO / --puerto COM5)

Mapa de estados (specs/03): idle→idle · escuchando→atento · pensando→confundido (mira arriba) · hablando→hablando (boca)
· anotando→atento + gesto asentir. Latido cada 500 ms para que el ESP32 no caiga a modo reflejo.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import httpx
import serial
import serial.tools.list_ports

MAPA = {
    "idle": ("idle", ""),
    "dormido": ("aburrido", ""),          # esperando "Hola Token": párpados a media asta, cabeza baja
    "escuchando": ("atento", ""),
    "pensando": ("confundido", ""),
    "hablando": ("hablando", ""),
    "anotando": ("atento", "asentir"),
    "aburrido": ("aburrido", "bostezo"),   # > 30 s hablando sin parar
    "confundido": ("confundido", ""),      # muletillas seguidas
    "impresionado": ("atento", "asentir"), # una cifra concreta
}


def convex_url() -> str:
    for f in (Path(__file__).parent.parent / ".env.local", Path(__file__).parent.parent / ".env"):
        if f.exists():
            for l in f.read_text(encoding="utf-8").splitlines():
                if l.startswith("CONVEX_URL="):
                    return l.split("=", 1)[1].strip().strip('"')
    return os.environ.get("CONVEX_URL", "")


def puerto_auto() -> str | None:
    env = os.environ.get("TOKENGATE_PUERTO", "").strip()
    if env:
        return env
    for p in serial.tools.list_ports.comports():
        d = p.description or ""
        if "CP210" in d or "CH340" in d or "USB" in d:
            return p.device
    return None


def main() -> int:
    url = convex_url()
    if not url:
        print("Falta CONVEX_URL en .env.local")
        return 1
    puerto = sys.argv[sys.argv.index("--puerto") + 1] if "--puerto" in sys.argv else puerto_auto()
    if not puerto:
        print("No encuentro el ESP32 (usa --puerto COM5). Sigo sin robot, solo imprimo estados.")
    s = None
    if puerto:
        try:
            s = serial.Serial(puerto, 115200, timeout=0.3)
            time.sleep(2.5)  # abrir el puerto reinicia la placa
            s.reset_input_buffer()
            s.write(b'{"cmd":"ping"}\n')
            time.sleep(0.3)
            print(f"robot en {puerto}: {s.read_all().decode(errors='ignore').strip() or '(sin pong; sigo)'}")
        except Exception as e:  # noqa: BLE001
            print(f"No pude abrir {puerto}: {e}. ¿Consola de servos abierta? Sigo sin robot.")
            s = None

    cliente = httpx.Client(base_url=url.rstrip("/"), timeout=6.0, headers={"content-type": "application/json"})
    ultimo_estado = None
    ultimo_envio = 0.0
    print("siguiendo panel:cuerpo cada 300 ms. Ctrl+C para salir.")
    try:
        while True:
            t = time.monotonic()
            try:
                r = cliente.post("/api/query", json={"path": "panel:cuerpo", "args": {}, "format": "json"})
                estado = ((r.json() or {}).get("value") or {}).get("estado", "idle")
            except Exception as e:  # noqa: BLE001
                print(f"convex: {e!r}")
                estado = ultimo_estado or "idle"
            cambio = estado != ultimo_estado
            if cambio or time.monotonic() - ultimo_envio >= 0.5:
                emo, gesto = MAPA.get(estado, ("idle", ""))
                msg = {"e": emo, "g": gesto if cambio else "", "c": 0}
                if s:
                    try:
                        s.write((json.dumps(msg) + "\n").encode())
                        s.read_all()
                    except Exception as e:  # noqa: BLE001
                        print(f"serial: {e!r}")
                if cambio:
                    print(f"{time.strftime('%H:%M:%S')}  {estado:12s} → {msg}")
                ultimo_estado = estado
                ultimo_envio = time.monotonic()
            time.sleep(max(0.05, 0.3 - (time.monotonic() - t)))
    except KeyboardInterrupt:
        pass
    finally:
        if s:
            try:
                s.write(b'{"e":"idle","g":"","c":0}\n')
                s.close()
            except Exception:  # noqa: BLE001
                pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
