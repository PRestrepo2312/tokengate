"""Crea (o actualiza) el asistente TOKENGATE en Vapi a partir de vapi/asistente.json.

    set VAPI_PRIVATE_KEY=...            (PowerShell: $env:VAPI_PRIVATE_KEY="...")
    python vapi/crear_asistente.py                # crea y muestra el assistant id
    python vapi/crear_asistente.py <assistant_id> # actualiza uno existente (PATCH)

Antes: cambiar "voiceId" en asistente.json por una voz en español de ElevenLabs (dashboard de Vapi → Voices).
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.vapi.ai/assistant"


def main() -> int:
    key = os.environ.get("VAPI_PRIVATE_KEY", "").strip()
    if not key:
        print("Falta VAPI_PRIVATE_KEY en el entorno.")
        return 1
    cuerpo = json.loads((Path(__file__).parent / "asistente.json").read_text(encoding="utf-8"))
    if cuerpo["voice"]["voiceId"].startswith("CAMBIAR"):
        print("Cambia voice.voiceId en vapi/asistente.json por una voz en español (dashboard de Vapi → Voices).")
        return 1
    assistant_id = sys.argv[1] if len(sys.argv) > 1 else None
    url = f"{API}/{assistant_id}" if assistant_id else API
    metodo = "PATCH" if assistant_id else "POST"
    req = urllib.request.Request(
        url,
        data=json.dumps(cuerpo).encode("utf-8"),
        method=metodo,
        headers={"authorization": f"Bearer {key}", "content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"Vapi {e.code}: {e.read().decode('utf-8')[:800]}")
        return 1
    print(f"{metodo} OK · assistant id: {data.get('id')}")
    print("Ponlo en web/.env.local como VITE_VAPI_ASSISTANT_ID")
    return 0


if __name__ == "__main__":
    sys.exit(main())
