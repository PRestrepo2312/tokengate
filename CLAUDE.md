# CLAUDE.md — TOKENGATE

Hackathon **The Next Craft** · sábado 29-ago-2026 · Bogotá · Track 02 "Out of the Box".
Jurado: **demo en vivo + pitch de 3 min, sin slides**. Code freeze **20:00**, demos **20:15**.
Segundo proyecto del equipo, en paralelo a LUMI (`../Nomi`). Comparten cuenta de Convex (equipo `pedro-restrepo`), la cuenta AWS de
Andrey (Bedrock + Amplify) y los créditos de partners (Vapi, ElevenLabs, Tavily).

## Qué es

> TOKENGATE, presentado como **Tokenpirin** (`tokenpirin.lupia.click`), es un compañero de tareas para niños: le dices "Hola Token", le cuentas tu tarea o tu duda, te guía con
> pistas sin hacerla por ti, investiga lo que no sabe, y la próxima vez recuerda tu nombre, en qué tema ibas y qué te costaba.
> (Pivot del 29-ago 17:25. Prompt: `vapi/prompt_tutor.md`. Voz: Azure es-CO-SalomeNeural. Tools: recordar_usuario,
> guardar_memoria, investigar. Antes fue coach de pitch (`vapi/prompt_coach.md`) y vendedor.)

Visión original de un compañero: `AI_SALES_ROBOT.md` (ESP32 → WebRTC → OpenAI Realtime → tools → Convex → learning loop).
Lo que se construye hoy está en `specs/00`: **la misma conversación y la misma memoria, con la voz en tiempo real a cargo de
Vapi (partner, $50) y el ESP32 como cuerpo**, porque el WROOM-32 sin PSRAM no puede correr WebRTC + Opus.

## La regla del hackathon

FAQ Q05: el código debe escribirse durante las horas del evento. Este repo nació a las 12:45 del 29-ago.

## Mapa

| Ruta | Qué es |
|---|---|
| `AI_SALES_ROBOT.md` | Documento original del compañero. Es la visión; `specs/00` dice qué de eso cabe hoy. |
| `specs/00_decisiones_y_realidad.md` | **LEER PRIMERO.** Realidad del hardware, dos caminos, qué se construye hoy. |
| `specs/01_convex_memoria_tools.md` | Tablas, tools por webhook, analizador. OJO: escrito para la versión "vendedor"; las tools vigentes (coach) están en `vapi/TOOLS_VAPI.md` y `convex/tools.ts`. |
| `specs/02_voz_realtime.md` | Camino B (Vapi en el navegador, hoy) y camino A (ESP-IDF + esp-webrtc, con otro hardware). |
| `specs/03_robot_cuerpo.md` | El ESP32 como cuerpo: estados escuchando / pensando / hablando. |
| `specs/04_demo_pitch.md` | Guion de 3 minutos y cronograma de la tarde. |
| `DESCARGAS.md` | Cuentas, keys y herramientas que faltan. |
| `convex/` | Cerebro y memoria (TypeScript). `schema.ts` ya escrito. |
| `web/` | Página con el botón "Habla con el vendedor" (Vapi Web SDK) y el panel de memoria. |
| `robot/` | Firmware del cuerpo (reutiliza el protocolo serial de LUMI). |

## Arquitectura de hoy (camino B)

```
PÚBLICO habla ──► navegador (web/, Vapi Web SDK: micro + parlante del portátil / robot)
                     │  audio en tiempo real, barge-in, VAD: lo hace Vapi
                     ▼
                  VAPI (STT Deepgram · LLM · TTS ElevenLabs)  ──tool-calls (webhook)──►  CONVEX http action /vapi
                     │                                                                  ├─ get_customer_context
                     │  transcript, speech-start/end                                    ├─ get_product_info · get_pricing
                     ▼                                                                  ├─ create_lead · schedule_demo
                  web/ → Convex (mutations)                                             └─ save_customer_memory
                     │                                                                  al colgar: analizador (Claude por Bedrock)
                     ▼                                                                  → customerMemory + salesInsights
                  ESP32 (robot/) por serial: cara/LED "escuchando · pensando · hablando"
```

## Decisiones cerradas

- Voz en tiempo real: **Vapi** (asistente en español, transcriber Deepgram `es`, voz ElevenLabs). Sin OpenAI key.
- Tools: **server-side** (Vapi → `https://<deployment>.convex.site/vapi`), nunca client-side: el modelo necesita el resultado.
- Fuente de verdad de la memoria: **Convex**. El LLM recibe contexto por tools, no "recuerda" solo.
- Identificación: por **cómo se presenta** ("soy Juan, de Acme"), igual que LUMI. Sin biometría hoy.
- El ESP32 **no procesa audio**: es cuerpo. Si no hay segundo ESP32, el cuerpo es la página en pantalla grande.
- Sin VPS, sin gateway propio, sin ESP-IDF hoy.

## Comandos

```bash
npm install
npx convex dev                                   # cerebro (dejar corriendo)
npx convex env set VAPI_PRIVATE_KEY ...          # para crear/actualizar el asistente desde Convex (opcional)
cd web && npm run dev                            # página con el botón de llamada
```

## Cómo trabajar

- Un archivo por tema en `convex/`. Las tools viven en `convex/http.ts` (router) + `convex/tools.ts` (una función por tool).
- Toda respuesta de tool es texto corto en español pensado para ser **dicho en voz alta**.
- Sin emojis en la UI ni en la voz. Commits pequeños; `git commit -m "final"` a las 19:50.
