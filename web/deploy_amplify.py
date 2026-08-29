"""Despliega web/dist en AWS Amplify Hosting (despliegue manual, sin repositorio).

Uso (desde Nomi/):  .venv\\Scripts\\python.exe web\\deploy_amplify.py [--sin-build]
Requiere credenciales AWS configuradas (usuario con permisos amplify:*) y boto3.
Deja la app "tokengate", rama "main", y devuelve https://main.<appId>.amplifyapp.com
"""

from __future__ import annotations

import io
import os
import subprocess
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

import boto3

REGION = "us-east-1"
APP = "tokengate"
BRANCH = "main"
CONVEX_URL = "https://honorable-capybara-700.convex.cloud"
AQUI = Path(__file__).resolve().parent
DIST = AQUI / "dist"

# Regla SPA: cualquier ruta sin extensión de archivo → index.html (200).
REGLA_SPA = {
    "source": "</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>",
    "target": "/index.html",
    "status": "200",
}


def construir() -> None:
    env = dict(os.environ)
    env.setdefault("VITE_CONVEX_URL", CONVEX_URL)  # .env.local manda; esto es la red de seguridad
    print("npm run build ...", flush=True)
    subprocess.run("npm run build", cwd=AQUI, shell=True, check=True, env=env)
    html = (DIST / "index.html").read_text(encoding="utf-8")
    js = "".join(p.read_text(encoding="utf-8", errors="ignore") for p in (DIST / "assets").glob("*.js"))
    if CONVEX_URL not in js and CONVEX_URL not in html:
        sys.exit(f"El build no contiene {CONVEX_URL}: revisa web/.env.local (VITE_CONVEX_URL)")


def empaquetar() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for p in DIST.rglob("*"):
            if p.is_file():
                z.write(p, p.relative_to(DIST).as_posix())
    return buf.getvalue()


def main() -> None:
    if "--sin-build" not in sys.argv:
        construir()
    if not (DIST / "index.html").exists():
        sys.exit("No existe web/dist/index.html")
    zip_bytes = empaquetar()
    print(f"zip: {len(zip_bytes) / 1024:.0f} KB", flush=True)

    amp = boto3.client("amplify", region_name=REGION)

    apps = amp.list_apps(maxResults=100)["apps"]
    app = next((a for a in apps if a["name"] == APP), None)
    if app is None:
        print(f"creando app {APP} ...", flush=True)
        app = amp.create_app(name=APP, platform="WEB", customRules=[REGLA_SPA])["app"]
    app_id = app["appId"]

    try:
        amp.get_branch(appId=app_id, branchName=BRANCH)
    except amp.exceptions.NotFoundException:
        print(f"creando rama {BRANCH} ...", flush=True)
        amp.create_branch(appId=app_id, branchName=BRANCH, stage="PRODUCTION", enableAutoBuild=False)

    dep = amp.create_deployment(appId=app_id, branchName=BRANCH)
    job_id = dep["jobId"]
    req = urllib.request.Request(dep["zipUploadUrl"], data=zip_bytes, method="PUT", headers={"Content-Type": "application/zip"})
    with urllib.request.urlopen(req, timeout=120) as r:
        if r.status not in (200, 201):
            sys.exit(f"subida del zip falló: {r.status}")
    amp.start_deployment(appId=app_id, branchName=BRANCH, jobId=job_id)

    url = f"https://{BRANCH}.{app['defaultDomain']}"
    inicio = time.time()
    while True:
        estado = amp.get_job(appId=app_id, branchName=BRANCH, jobId=job_id)["job"]["summary"]["status"]
        print(f"  {estado}", flush=True)
        if estado == "SUCCEED":
            break
        if estado in ("FAILED", "CANCELLED"):
            sys.exit(f"despliegue {estado}")
        if time.time() - inicio > 300:
            sys.exit("timeout esperando el despliegue")
        time.sleep(5)

    # Verificación: 200 y "LUMI" en el HTML.
    for intento in range(12):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                cuerpo = r.read().decode("utf-8", errors="ignore")
                if r.status == 200 and "TOKENPIRIN" in cuerpo:
                    print(f"OK {url}")
                    return
        except Exception as e:  # noqa: BLE001 - propagación de DNS/CDN, reintentar
            print(f"  esperando URL ({e})", flush=True)
        time.sleep(5)
    sys.exit(f"desplegó pero {url} no responde con TOKENPIRIN todavía")


if __name__ == "__main__":
    main()
