# 03 — El ESP32 como cuerpo

El ESP32 no captura ni reproduce audio (ver `specs/00` §2). Es el cuerpo: muestra en qué está el vendedor.

## Estados

| Estado | Cuándo | Cara (si hay matriz) / LED (si no) |
|---|---|---|
| `idle` | sin llamada | parpadeo lento / respiración azul tenue |
| `escuchando` | `call-start` y cada `speech-end` del asistente | ojos abiertos, pupila sigue / verde fijo |
| `pensando` | transcript final del usuario hasta `speech-start` del asistente | ojos arriba, parpadeo rápido / ámbar latiendo |
| `hablando` | `speech-start` → `speech-end` | boca animada / blanco pulsando al ritmo |
| `anotando` | mientras corre una tool (`tool-calls` → respuesta) | ojo guiñado 400 ms / destello |

## Protocolo

Reutilizar el de LUMI (`../Nomi/specs/01` §2): serial USB 115200, una línea JSON por mensaje, `{"e":"hablando","g":"","c":0}`,
latido cada 500 ms, 3 s sin mensajes → `idle`. Si el cuerpo es el ESP32 con matrices, el firmware de LUMI (`../Nomi/firmware/lumi`)
sirve tal cual: solo cambia quién manda los estados. Si es el ESP32 de repuesto con un LED RGB (o el LED azul de la placa), un
sketch de 60 líneas con la misma lectura serial y una tabla estado → color/patrón.

## Quién manda los estados

La página `web/` recibe los eventos de Vapi. Dos opciones, en orden de simplicidad:

1. **Agente local mínimo** (`robot/puente.py`, 40 líneas): la página escribe el estado en Convex (`cuerpo.estado`), y un script
   Python en el portátil hace polling cada 300 ms y lo manda por serial (copiar `robot.py` de LUMI). Funciona con cualquier
   navegador, incluso en otro equipo.
2. **Web Serial API** desde la página (Chrome): la página abre el COM directamente y escribe las líneas JSON. Sin Python. Solo
   Chrome/Edge y requiere un clic de permiso; para la demo es suficiente.

## Si no hay ESP32 disponible

LUMI tiene prioridad sobre el ESP32 con matrices (`specs/00` §6). El cuerpo de TOKENGATE en ese caso es la página en pantalla
grande: una cara simple en CSS (dos ojos y una boca) con los mismos cinco estados. Nadie en el jurado va a preguntar por el
chip; sí van a notar si el robot "no reacciona" mientras piensa.
