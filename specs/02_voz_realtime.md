# 02 — Voz en tiempo real

## A. Hoy: Vapi (partner, $50 por participante)

Vapi es un agente de voz en tiempo real: STT + LLM + TTS + detección de turno + interrupciones, con tools por webhook. Hace
el papel que el documento le da a "OpenAI Realtime". Documentación: https://docs.vapi.ai (Web calls, Custom tools, Server URL).

### Asistente (crear en el dashboard de Vapi o por API con la private key)

- Nombre: TOKENGATE. Idioma: español. `transcriber`: Deepgram, `language: "es"`. `voice`: ElevenLabs, una voz masculina o
  femenina en español (probar dos). `firstMessage`: "Hola. Soy el vendedor de TOKENGATE. ¿Con quién hablo?"
- `model.messages[0]` (system): personaje y reglas (§A.2). `model.tools`: las 7 de `specs/01` §2, **cada una con
  `server.url = https://<deployment>.convex.site/vapi`** (tool server URL tiene prioridad sobre el assistant server URL).
- `serverUrl` del asistente = la misma URL (para `transcript`, `status-update`, `end-of-call-report`).
- `serverMessages`: `["tool-calls", "transcript", "status-update", "end-of-call-report"]`.
- `clientMessages`: `["transcript", "speech-update", "status-update"]` (los usa `web/` para el cuerpo y el transcript).

### A.2 System prompt del vendedor (v1)

> Eres el vendedor de TOKENGATE. Hablas español neutro, frases cortas, tono cálido y directo; nunca lees listas largas.
> Primero pregunta con quién hablas y de qué empresa; en cuanto lo sepas, llama `get_customer_context`. Si hay historial, úsalo
> de forma natural ("la última vez hablamos de..."). No inventes precios, funciones ni integraciones: usa `get_pricing` y
> `get_product_info`. Cuando detectes un interés u objeción, llama `save_customer_memory`. Si la persona pide una demo, llama
> `schedule_demo` y confirma en una frase. Si la intención es alta, `create_lead`. Cierra siempre con un siguiente paso.
> Si te interrumpen, para y escucha.

### A.3 Web SDK (`web/`)

`npm i @vapi-ai/web`. `const vapi = new Vapi(PUBLIC_KEY); vapi.start(ASSISTANT_ID)` al pulsar el botón; `vapi.stop()` para
colgar. Eventos: `call-start`, `call-end`, `speech-start`/`speech-end` (el asistente habla → cuerpo en `hablando`), `message`
(transcript parciales y finales → pantalla; también van al server). Las tools son **server-side**: el navegador no las ejecuta.
Public key en `web/.env.local` (`VITE_VAPI_PUBLIC_KEY`, `VITE_VAPI_ASSISTANT_ID`); la private key solo en Convex si se
automatiza la creación del asistente.

### A.4 Prueba de humo (antes de la página)

Desde el dashboard de Vapi, "Talk to assistant": "Hola, soy Juan, de Acme. ¿Cuánto cuesta el Enterprise?" → debe llamar
`get_customer_context` y `get_pricing` y responder con el precio de Convex. Ver las llamadas en los logs de Convex.

## B. El camino del documento: ESP32 → WebRTC → OpenAI Realtime (otro hardware)

Requisitos reales: **ESP32-S3 con PSRAM** (S3-Korvo-2 es el hardware del demo; S3-Box o S3 devkit + INMP441 I2S + MAX98357A
también), **ESP-IDF 5.x**, `esp-webrtc-solution/solutions/openai_demo`, y una **OpenAI API key**. Flujo de credenciales del
documento: backend seguro (una http action de Convex) → `POST /v1/realtime/client_secrets` → token efímero al ESP32 →
`POST /v1/realtime/calls` (SDP). Tools: function calling del modelo → el ESP32 recibe el evento → llama a Convex por HTTPS →
devuelve el resultado al modelo. Alternativa con Arduino: **ElatoAI** (cookbook de OpenAI), ESP32-S3 + gateway Deno.
Tiempo estimado con hardware en mano: 1–2 días. Se deja como fase 2 del proyecto.

## C. Punto medio: OpenAI Realtime por WebRTC desde el navegador (si aparece una OpenAI key)

Misma página `web/`, sin Vapi: el navegador negocia WebRTC con `gpt-realtime` usando un token efímero que emite una http action
de Convex (`/realtime/token`), y los `function_call` del modelo se resuelven llamando a Convex desde el navegador. Convex no
cambia. Solo tiene sentido si hay key y si Vapi falla; no es plan A.

## D. Latencia y sensación

Vapi típico: 0,8–1,5 s de turno a turno; barge-in nativo. Para que se sienta "robot", el cuerpo (`specs/03`) debe cambiar a
`pensando` en cuanto termina de hablar la persona y a `hablando` con `speech-start`: la cara tapa la latencia.
