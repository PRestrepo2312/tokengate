# DESCARGAS — TOKENGATE (29-ago)

Lo que hace falta para el camino B (`specs/00`). Casi todo ya existe por LUMI en este portátil.

## Ya está (heredado de LUMI)

Node 22 · `npx convex` 1.45 (login hecho, equipo `pedro-restrepo`) · Python 3.12 + `pyserial` (para `robot/puente.py`) ·
Arduino IDE + core ESP32 + arduino-cli · cuenta AWS de Andrey configurada (Bedrock, Amplify) · `git` con identidad PRestrepo2312.

## Falta

| Qué | Cómo | Para qué |
|---|---|---|
| **Vapi** (cada integrante canjea sus $50) | Enlace de canje del evento → cuenta → dashboard. Copiar **Public Key** (para `web/`) y **Private Key** (solo si se crea el asistente por API). | Voz en tiempo real, tools por webhook. |
| Asistente en Vapi | Dashboard → Assistants → nuevo, con `specs/02` §A. Copiar el **Assistant ID**. | `web/` lo arranca con `vapi.start(ASSISTANT_ID)`. |
| Proyecto Convex `tokengate` | **Hecho** (29-ago 12:46): deployment `honorable-capybara-700`, esquema desplegado. `CONVEX_URL=https://honorable-capybara-700.convex.cloud`. | Cerebro y memoria. **Webhook de Vapi: `https://honorable-capybara-700.convex.site/vapi`** (cuando exista `convex/http.ts`). |
| Repo GitHub | **Hecho**: https://github.com/PRestrepo2312/tokengate (privado, autor PRestrepo2312). | Entrega a las 20:00. |
| Credenciales Bedrock en Convex | `npx convex env set AWS_ACCESS_KEY_ID ...`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION us-east-1`, `LUMI_LLM bedrock` (mismos valores que en LUMI; `aws configure get aws_access_key_id`). | Analizador de conversaciones. |
| `web/` | `npm create vite@latest web -- --template react-ts && cd web && npm i convex @vapi-ai/web` | Botón de llamada + panel. |
| Repo remoto | `gh repo create tokengate --private` con la cuenta PRestrepo2312 (activa en `gh`). | Entrega a las 20:00. |
| OpenAI API key | Opcional. Solo para `specs/02` §C. | — |
| ESP-IDF + esp-webrtc | **No hoy.** Solo para el camino A con una ESP32-S3 con PSRAM. | — |

## Prueba de humo del webhook (antes de Vapi)

```bash
curl -X POST https://<deployment>.convex.site/vapi -H "content-type: application/json" \
  -d '{"message":{"type":"tool-calls","toolCallList":[{"id":"t1","name":"get_pricing","arguments":{"producto":"Enterprise"}}]}}'
# → {"results":[{"toolCallId":"t1","result":"Enterprise cuesta 999 dólares al mes..."}]}
```
