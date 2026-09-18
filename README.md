# TOKENGATE

**Un vendedor físico con memoria.** Proyecto ganador del hackathon **The Next Craft 2026**.

Le hablas, te reconoce, te da el precio real, te agenda la demo, y la próxima vez retoma la conversación donde quedó.

## Qué hace

- **Conversa por voz en tiempo real**, con interrupciones naturales (barge-in).
- **Reconoce al cliente** y recupera lo que se habló antes: qué preguntó, qué objetó, en qué etapa va.
- **Responde con datos reales** mediante tools: producto, precios, creación de leads y agendamiento de demos.
- **Aprende de cada conversación**: al colgar, un analizador con IA actualiza la memoria del cliente y extrae insights de venta (por ejemplo, la objeción más frecuente).
- **Tiene cuerpo**: un ESP32 muestra el estado del robot (escuchando, pensando, hablando).

## Arquitectura

```
Persona -> micrófono -> Vapi Web SDK (STT + LLM + TTS + VAD)
                          |
                          | tool-calls por webhook
                          v
                    Convex (http action)
                    - memoria de clientes, historial, leads, demos
                    - get_customer_context, get_pricing, create_lead, schedule_demo
                          |
                          | al colgar
                          v
               Analizador con Claude (Amazon Bedrock)
               -> customerMemory + salesInsights (learning loop)

ESP32 = cuerpo: estados por serial desde robot/puente.py
```

La decisión de diseño central: **el modelo conversacional no es la memoria**. La memoria vive en Convex, con contratos de tools claros, y el aprendizaje ocurre por análisis de conversaciones, no por reentrenamiento.

## Estructura

| Carpeta | Contenido |
|---|---|
| `convex/` | Esquema, tools, webhook de Vapi, analizador de conversaciones y panel |
| `web/` | Front en Vite + TypeScript con el Vapi Web SDK y el panel de clientes |
| `vapi/` | Definición del asistente, prompts y script para crearlo por API |
| `robot/` | Puente serial con el ESP32 y script de arranque |
| `specs/` | Decisiones de diseño, memoria y tools, voz, cuerpo del robot, guion del demo |

`AI_SALES_ROBOT.md` describe la visión completa (ESP32-S3 con WebRTC directo a un modelo realtime); `specs/00_decisiones_y_realidad.md` explica qué se construyó durante el hackathon y por qué.

## Cómo correrlo

```bash
cp .env.example .env.local        # completar las llaves de Convex y Vapi
npm install
npx convex dev                    # backend y memoria

cd web && npm install && npm run dev   # front con la voz y el panel

python vapi/crear_asistente.py    # crea o actualiza el asistente en Vapi
python robot/puente.py            # opcional: cuerpo ESP32 por serial
```

## Stack

`TypeScript` `Convex` `Vapi` `Amazon Bedrock` `Vite` `Python` `ESP32`
