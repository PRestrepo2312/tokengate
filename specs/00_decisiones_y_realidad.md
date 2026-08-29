# 00 — Decisiones y realidad (29-ago, 12:45; quedan ~7 h)

## 1. La visión (AI_SALES_ROBOT.md) y qué opino

La visión es buena y está bien pensada: separar **cerebro conversacional** (modelo realtime) de **memoria persistente**
(Convex), no confiar en que el LLM "recuerde", tools con contrato claro, learning loop por análisis y no por reentrenamiento.
Todo eso se mantiene. Lo que no cabe hoy es **la ruta física del audio** que propone el documento.

## 2. Realidad del hardware (verificada)

| Lo que pide el documento | Lo que hay |
|---|---|
| `esp-webrtc-solution/solutions/openai_demo` | Corre sobre **ESP32-S3-Korvo-2**: S3 con **8 MB de PSRAM**, códec de audio ES8311, amplificador, micrófonos I2S. |
| Placa | **ESP32-WROOM-32 clásico** (foto del 29-ago, CP2102): 520 KB de RAM, **sin PSRAM**. WebRTC + DTLS/SRTP + Opus no caben. |
| Micrófono | Un **KY-038** (analógico, calidad de detector de sonido, no de voz) y un **micro USB** (va al portátil, no al ESP32). |
| Parlante | **Bluetooth** (se empareja con el portátil; el ESP32 clásico no hace A2DP + WebRTC a la vez). |
| Toolchain | El demo es **ESP-IDF 5.x** (2–3 GB, horas de setup), no Arduino. |
| Credenciales | No hay **OpenAI API key** en el equipo. Sí hay: Vapi $50, ElevenLabs, Convex, Bedrock (cuenta de Andrey). |

Conclusión: **"ESP32 → WebRTC → OpenAI Realtime" no se puede construir hoy con este hardware**, y aunque hubiera una S3 con
PSRAM, el setup de ESP-IDF + esp-webrtc comería la tarde entera antes de la primera conversación. Fase 0 del documento
("identificar hardware") ya está hecha y la respuesta es esa.

## 3. Dos caminos

### Camino A — el del documento (con otro hardware, otro día)

ESP32-S3 con PSRAM (S3-Korvo-2, S3-Box, o S3 devkit + INMP441 I2S + MAX98357A) → ESP-IDF → `esp-webrtc` `openai_demo` → token
efímero (`POST /v1/realtime/client_secrets`) emitido por una http action de Convex → tools por function calling. Alternativa
Arduino: **ElatoAI** (cookbook de OpenAI) sobre ESP32-S3 con un gateway Deno (contradice "sin VPS"). Detalle en `specs/02` §B.
**Se documenta, no se construye hoy.**

### Camino B — lo que se construye hoy: misma conversación, misma memoria, la voz por Vapi

```
Persona → micrófono del portátil/robot → Vapi Web SDK (navegador)
Vapi = STT (Deepgram es) + LLM + TTS (ElevenLabs) + VAD + barge-in     ← todo lo de "Fase 5" viene resuelto
Vapi → tool-calls por webhook → Convex http action /vapi → get_customer_context, get_pricing, create_lead, schedule_demo...
Al colgar → Convex analiza la conversación con Claude (Bedrock) → customerMemory + salesInsights (learning loop)
ESP32 = cuerpo: cara/LED "escuchando · pensando · hablando" por serial (protocolo de LUMI), servos si hay
```

Es **exactamente el flujo de las secciones 12–22 y 29–30 del documento**, con Vapi haciendo el papel de "OpenAI Realtime" y
el navegador el de la tarjeta de audio del robot. Para el jurado, la diferencia es invisible: le hablas al robot y el robot
responde, con memoria.

## 4. Por qué Vapi y no OpenAI Realtime en el navegador

Las dos sirven. Vapi gana hoy por tres razones: hay **$50 de créditos** y cero keys que conseguir; trae **VAD, interrupciones,
transcripción y voces** configuradas en 5 minutos; y las tools por webhook son un contrato de 10 líneas. Si alguien consigue una
OpenAI key, el camino "WebRTC desde el navegador a `gpt-realtime`" es un cambio en `web/` sin tocar Convex (`specs/02` §C).

## 5. Qué se construye hoy, en orden

| Hora | Qué | Listo cuando |
|---|---|---|
| 13:00–13:45 | Convex: `schema.ts` (hecho), seed de productos y precios, `tools.ts` con `get_customer_context`, `get_product_info`, `get_pricing`, `http.ts` con `/vapi`. | `npx convex run` devuelve el precio de "Enterprise". |
| 13:45–14:30 | Vapi: asistente en español (prompt de vendedor, `specs/02` §A), tools apuntando a `https://<deployment>.convex.site/vapi`. Prueba desde el dashboard de Vapi. | Le preguntas el precio y responde con el dato de Convex. |
| 14:30–15:30 | `web/`: botón "Habla con el vendedor" (Vapi Web SDK), transcript en vivo, panel de memoria del cliente. | Conversación completa desde la página. |
| 15:30–16:30 | Memoria: `save_customer_memory`, `create_lead`, `schedule_demo`; al colgar, analizador con Claude → `customerMemory`. | "Hola, soy Juan de Acme" la segunda vez → "Recuerdo que hablamos de automatización". |
| 16:30–18:00 | Cuerpo: ESP32 con estados por serial; `salesInsights` (objeción más frecuente) en el panel. Ensayo del guion. | |
| 18:30 | Freeze interno, video, ensayos. 19:50 commit final. | |

## 6. Hardware compartido con LUMI

Hay **un** ESP32 con matrices y servos. Si LUMI lo usa, el cuerpo de TOKENGATE es el **ESP32 de repuesto** con un LED RGB o un
servo (estados por color/postura), o simplemente **la página en pantalla grande** con la cara animada. Decidir a las 16:00
según cómo vaya cada demo; ninguno de los dos depende del otro para funcionar.

## 7. Lo que no se hace hoy

ESP-IDF, esp-webrtc, WebRTC en el ESP32, VPS/gateway, reconocimiento biométrico, fine-tuning, A/B testing, inventario real,
integración con un CRM. Todo está en `AI_SALES_ROBOT.md` como fases 3, 4 y 11, y ahí se queda para después del evento.
