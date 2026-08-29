# 🤖 AI Sales Robot

Robot físico basado en **ESP32** capaz de escuchar conversaciones, razonar mediante **OpenAI Realtime**, consultar información y ejecutar acciones mediante **tools conectadas a Convex**, mantener memoria de clientes y responder mediante voz en tiempo real.

El objetivo es construir un **agente de ventas físico** que pueda conversar naturalmente con potenciales clientes, utilizar información histórica del cliente y mejorar progresivamente mediante el análisis de conversaciones.

---

# 1. Objetivo

El robot deberá ser capaz de:

- 🎤 Escuchar al usuario mediante un micrófono.
- 🧠 Comprender y razonar sobre la conversación.
- 💬 Mantener el contexto de la conversación actual.
- 🗃️ Consultar el historial del cliente.
- 🧠 Recuperar memoria de conversaciones anteriores.
- 🔧 Ejecutar herramientas.
- 📦 Consultar información de productos.
- 💰 Consultar precios.
- 👤 Identificar al cliente.
- 📝 Guardar conversaciones.
- 📊 Analizar conversaciones anteriores.
- 📈 Construir un learning loop.
- 🔊 Generar respuestas habladas.
- 🤖 Reproducir las respuestas mediante el speaker.
- ⚡ Mantener conversaciones en tiempo real.
- 🛑 Manejar interrupciones del usuario.

---

# 2. Arquitectura objetivo

La arquitectura que intentaremos primero es:

```text
                         INTERNET
                            │
                            │ WebRTC
                            ▼
                  ┌───────────────────┐
                  │  OpenAI Realtime  │
                  │                   │
                  │ gpt-realtime-2.1  │
                  │                   │
                  │ 👂 Audio          │
                  │ 🧠 Reasoning      │
                  │ 🔧 Tools          │
                  │ 🔊 Audio          │
                  └─────────┬─────────┘
                            │
                       Tool calls
                            │
                            ▼
                       ┌─────────┐
                       │ Convex  │
                       │         │
                       │ Memory  │
                       │ Users   │
                       │ History │
                       │ Products│
                       │ Leads   │
                       └─────────┘
                            ▲
                            │
                            │
                    ┌───────┴───────┐
                    │    ESP32      │
                    │               │
                    │ 🎤 Microphone │
                    │ 🔊 Speaker    │
                    │ 📡 WiFi       │
                    └───────────────┘
```

**No se utilizará una VPS/Robot Gateway inicialmente.**

La primera alternativa será una conexión directa entre el ESP32 y OpenAI Realtime mediante WebRTC.

Espressif mantiene actualmente una implementación oficial de WebRTC para ESP32 y un `openai_demo` específico para conectar un ESP32 con OpenAI Realtime.

---

# 3. Hardware

## 3.1 ESP32

El robot utiliza una placa basada en ESP32.

El **CP2102 no es el procesador principal**.

CP2102:

```text
USB ↔ UART
```

El que proporciona:

```text
WiFi
Bluetooth
CPU
RAM
I2S
GPIO
```

es el ESP32.

Antes de implementar el firmware definitivo debemos identificar exactamente el modelo:

```text
ESP32-WROOM-32
ESP32-WROOM-32E
ESP32-S3
ESP32-S3-WROOM
etc.
```

Esto es importante porque la compatibilidad y los recursos disponibles dependen de la variante.

---

# 4. Audio

El robot tendrá:

```text
🎤 Micrófono
      │
      ▼
    ESP32
      │
      │ WebRTC
      ▼
OpenAI Realtime
      │
      │ Audio
      ▼
    ESP32
      │
      ▼
🔊 Speaker
```

El ESP32 será responsable únicamente de la captura y reproducción del audio.

No ejecutará el modelo de IA.

---

# 5. OpenAI Realtime

El modelo principal será:

```text
gpt-realtime-2.1
```

OpenAI lo describe como un modelo de razonamiento con **audio de entrada y salida, speech-to-speech, tool use y configurable reasoning effort**. Tiene una ventana de contexto de 128K tokens.

El flujo será:

```text
🎤 Audio
   ↓
GPT Realtime
   ↓
Comprensión
   ↓
Razonamiento
   ↓
Tool call (si es necesario)
   ↓
Respuesta
   ↓
🔊 Audio
```

No será necesario implementar manualmente:

```text
Audio
 ↓
STT
 ↓
Texto
 ↓
LLM
 ↓
Texto
 ↓
TTS
 ↓
Audio
```

El modelo trabaja directamente con audio.

---

# 6. Conexión ESP32 → OpenAI

La primera opción será:

```text
ESP32
   │
   │ WiFi
   │
   │ WebRTC
   ▼
OpenAI Realtime
```

Espressif tiene una solución oficial `esp-webrtc-solution` que incluye:

- `esp_peer`
- captura de medios
- reproducción de medios
- WebRTC
- soluciones de audio/video
- integración con OpenAI

La solución incluye específicamente:

```text
solutions/openai_demo
```

para establecer una sesión WebRTC realtime con OpenAI.

---

# 7. OpenAI Demo de Espressif

Existe un demo oficial:

```text
esp-webrtc-solution/
└── solutions/
    └── openai_demo/
```

Este demo:

- establece una conexión realtime con OpenAI;
- utiliza WebRTC;
- utiliza audio;
- utiliza OPUS;
- soporta function calls;
- utiliza un token efímero para la sesión;
- permite controlar dispositivos mediante comandos de voz.

El hardware de referencia del demo es el:

```text
ESP32-S3-Korvo-2
```

por lo que debemos comprobar la compatibilidad de nuestra placa concreta antes de asumir que el código funcionará sin modificaciones.

---

# 8. Seguridad de API Keys

El ESP32 **no deberá almacenar permanentemente la API key principal de OpenAI** en producción.

El flujo recomendado es utilizar un mecanismo de credencial temporal para la sesión Realtime.

Conceptualmente:

```text
Backend seguro
      │
      │ OPENAI_API_KEY
      ▼
OpenAI
      │
      │ ephemeral client secret
      ▼
ESP32
      │
      │ WebRTC
      ▼
OpenAI Realtime
```

El demo oficial de Espressif utiliza precisamente el flujo de token efímero:

```text
POST /v1/realtime/client_secrets
```

y posteriormente intercambia SDP mediante:

```text
POST /v1/realtime/calls
```

usando ese token temporal.

---

# 9. Convex

Convex será la **memoria persistente y base de datos de la aplicación**.

Convex almacenará:

```text
Customers
Conversations
Messages
Memory
Products
Leads
Sales data
Analytics
```

La división será:

```text
OpenAI Realtime
=
Cerebro conversacional

Convex
=
Memoria persistente
```

---

# 10. Memoria de sesión vs memoria permanente

## Memoria de sesión

OpenAI Realtime mantiene el contexto necesario para la conversación actual.

Ejemplo:

```text
Usuario:
"Quiero comprar el Enterprise."

Robot:
"Claro."

Usuario:
"¿Cuánto cuesta?"

Robot entiende que "cuánto cuesta"
se refiere al Enterprise.
```

---

## Memoria permanente

Convex almacena información que debe sobrevivir a la sesión.

Ejemplo:

```json
{
  "name": "Juan",
  "company": "Acme",
  "role": "CTO",
  "interests": [
    "automation",
    "AI"
  ],
  "objections": [
    "price"
  ],
  "salesStage": "evaluation"
}
```

Cuando Juan vuelva a hablar con el robot:

```text
Juan
 ↓
Convex
 ↓
Customer Memory
 ↓
OpenAI Realtime
```

---

# 11. Identificación del usuario

## Primera versión

El usuario puede decir:

```text
"Soy Juan."
```

El modelo puede decidir consultar:

```text
get_customer_context("Juan")
```

---

## Versiones futuras

Podemos implementar métodos más fiables:

```text
QR
NFC
Código de usuario
Aplicación móvil
Cuenta de usuario
Reconocimiento de voz
Reconocimiento facial
```

No se implementará reconocimiento biométrico en el primer MVP.

---

# 12. Tools

OpenAI Realtime podrá utilizar tools para acceder a funcionalidades de nuestra aplicación.

Ejemplos:

```text
get_customer_context
get_previous_conversations
get_product_info
get_pricing
get_inventory
save_customer_memory
create_lead
update_sales_stage
schedule_demo
```

---

# 13. Flujo de una Tool

GPT no debería tener acceso directo arbitrario a la base de datos.

El flujo será:

```text
OpenAI Realtime
       │
       │ Tool Call
       ▼
Tool handler
       │
       ▼
Convex
       │
       ▼
Resultado
       │
       ▼
OpenAI Realtime
       │
       ▼
Respuesta de voz
```

Ejemplo:

```text
Usuario:

"¿Cuánto cuesta Enterprise?"

        ↓

GPT

        ↓

get_pricing("Enterprise")

        ↓

Convex

        ↓

{
  price: 999,
  currency: "USD",
  billing: "monthly"
}

        ↓

GPT

        ↓

"El plan Enterprise cuesta
999 dólares al mes."
```

GPT-Realtime-2.1 soporta function calling.

---

# 14. Conversación completa

Ejemplo:

```text
👤:
"Hola, soy Juan de Acme."

        ↓

🎤 ESP32
        ↓
OpenAI Realtime
        ↓

GPT identifica:

name = Juan
company = Acme

        ↓

get_customer_context("Juan")

        ↓

Convex

        ↓

Historial de Juan

        ↓

GPT

        ↓

🤖:
"¡Hola Juan! Recuerdo que estuvimos
hablando sobre automatización."
```

Después:

```text
👤:
"Sí. ¿Tienen integración con Salesforce?"
```

GPT:

```text
get_product_info()
get_integration_info()
```

Convex:

```text
resultado
```

GPT:

```text
🤖:
"Sí, contamos con integración con Salesforce..."
```

---

# 15. Respuesta de audio

La respuesta será generada por OpenAI Realtime como audio.

El flujo:

```text
OpenAI Realtime
       │
       │ Audio output
       ▼
     WebRTC
       │
       ▼
      ESP32
       │
       ▼
    Speaker
```

Por lo tanto, el robot no necesita hacer:

```text
Texto
 ↓
TTS externo
```

El modelo realtime ya trabaja con audio de entrada y salida.

---

# 16. Conversaciones

Cada conversación será almacenada en Convex.

Ejemplo:

```text
Conversation
├── id
├── customerId
├── robotId
├── startedAt
├── endedAt
└── outcome
```

Mensajes:

```text
Message
├── id
├── conversationId
├── role
├── transcript
├── timestamp
└── metadata
```

También podremos almacenar:

```text
tool calls
tool results
sales stage
customer intent
conversation outcome
```

---

# 17. Transcripción

Aunque el modelo trabaja directamente con audio, necesitaremos obtener una representación textual de la conversación para:

- historial;
- análisis;
- memoria;
- analytics;
- debugging;
- learning loop.

Ejemplo:

```text
USER:
"Quiero conocer el precio."

ASSISTANT:
"Claro, el plan Enterprise..."
```

Esta información podrá almacenarse en Convex.

---

# 18. Learning Loop

El robot no modificará automáticamente los pesos del modelo después de cada conversación.

El aprendizaje será principalmente mediante **memoria + análisis + estrategia**.

```text
Conversación
      ↓
Guardar
      ↓
Analizar
      ↓
Extraer información
      ↓
Actualizar memoria
      ↓
Actualizar insights
      ↓
Siguiente conversación
```

---

# 19. Conversation Analyzer

Después de una conversación se analizará:

```text
Intereses
Objeciones
Preguntas
Intención
Sales stage
Resultado
Siguiente acción recomendada
```

Ejemplo:

```json
{
  "interests": [
    "automation",
    "CRM"
  ],
  "objections": [
    "price"
  ],
  "salesStage": "evaluation",
  "outcome": "follow_up",
  "customerIntent": "high",
  "recommendedNextAction": "schedule_demo"
}
```

---

# 20. Customer Memory

Cada cliente tendrá una memoria persistente.

Ejemplo:

```text
Juan - Acme
│
├── Intereses
│   ├── AI
│   └── Automation
│
├── Objeciones
│   └── Price
│
├── Integraciones
│   └── Salesforce
│
├── Sales Stage
│   └── Evaluation
│
└── Última interacción
```

En una conversación futura:

```text
Juan
 ↓
Customer Memory
 ↓
GPT Realtime
```

---

# 21. Learning Loop global

Además de aprender individualmente sobre cada cliente, analizaremos todas las conversaciones.

```text
              Conversaciones
                    │
                    ▼
          Conversation Analyzer
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
    Objeciones    Pitches     Outcomes
        │           │           │
        └───────────┼───────────┘
                    ▼
              Sales Insights
                    │
                    ▼
             Agent Strategy
                    │
                    ▼
             GPT Realtime
```

Ejemplo:

```text
1000 conversaciones

Objeción más frecuente:
"Es demasiado caro."

Respuesta más efectiva:
Mostrar ROI antes de hablar de precio.

Pitch menos efectivo:
Explicar demasiadas funcionalidades.

Momento óptimo para demo:
Después de identificar el problema.
```

---

# 22. Herramientas comerciales

El robot podrá eventualmente realizar acciones reales.

Ejemplo:

```text
👤:
"Quiero una demostración."

        ↓

GPT

        ↓

schedule_demo()

        ↓

Convex / sistema externo

        ↓

Resultado

        ↓

GPT

        ↓

🔊:
"Perfecto, he registrado tu solicitud."
```

O:

```text
create_lead()
update_sales_stage()
save_customer_memory()
schedule_demo()
```

---

# 23. Arquitectura de datos

Propuesta inicial:

```text
Convex
│
├── customers
│
├── conversations
│
├── messages
│
├── customerMemory
│
├── products
│
├── leads
│
├── salesEvents
│
└── analytics
```

---

# 24. Estructura del proyecto

```text
ai-sales-robot/
│
├── robot/
│   │
│   └── esp32/
│       ├── audio/
│       ├── webrtc/
│       ├── wifi/
│       ├── hardware/
│       ├── openai/
│       └── main/
│
├── convex/
│   ├── schema.ts
│   ├── customers.ts
│   ├── conversations.ts
│   ├── messages.ts
│   ├── memory.ts
│   ├── products.ts
│   ├── leads.ts
│   └── analytics.ts
│
├── analyzer/
│   ├── conversation_analyzer/
│   ├── customer_memory/
│   └── sales_insights/
│
├── docs/
│   ├── architecture.md
│   ├── realtime.md
│   ├── esp32.md
│   ├── audio.md
│   ├── tools.md
│   ├── memory.md
│   └── learning-loop.md
│
└── README.md
```

---

# 25. Fases de desarrollo

## Fase 0 — Identificar hardware

Antes de programar:

- identificar modelo exacto de ESP32;
- identificar micrófono;
- identificar speaker;
- identificar codec/amplificador;
- comprobar si existe PSRAM;
- comprobar memoria disponible;
- comprobar compatibilidad con `esp-webrtc`.

El `CP2102` no es suficiente para identificar el ESP32.

---

# Fase 1 — Audio local

Primero probar:

```text
Micrófono
   ↓
ESP32
   ↓
Speaker
```

Objetivo:

Confirmar que podemos:

- capturar audio;
- reproducir audio;
- trabajar con I2S;
- mantener una calidad suficiente.

---

# Fase 2 — WiFi

```text
ESP32
   ↓
WiFi
   ↓
Internet
```

Implementar:

- conexión;
- reconexión;
- manejo de errores;
- estado de red.

---

# Fase 3 — WebRTC

Implementar:

```text
ESP32
   ↓
ESP-WebRTC
   ↓
conexión WebRTC
```

Utilizar como referencia:

```text
esp-webrtc-solution
└── solutions
    └── openai_demo
```

Espressif mantiene este demo oficialmente.

---

# Fase 4 — OpenAI Realtime

Conectar:

```text
ESP32
   ↓
WebRTC
   ↓
OpenAI Realtime
```

Modelo:

```text
gpt-realtime-2.1
```

Objetivo:

```text
🎤 Hablar al robot

        ↓

OpenAI

        ↓

🔊 Robot responde
```

---

# Fase 5 — Conversación natural

Implementar y probar:

- VAD;
- turn detection;
- silencios;
- interrupciones;
- barge-in;
- latencia;
- cancelación de respuestas.

Objetivo:

Que el robot se sienta como una conversación natural.

---

# Fase 6 — Tools

Implementar inicialmente:

```text
get_customer_context
get_product_info
get_pricing
```

Después:

```text
get_previous_conversations
get_inventory
save_customer_memory
create_lead
update_sales_stage
schedule_demo
```

---

# Fase 7 — Convex

Implementar:

```text
customers
conversations
messages
customerMemory
products
leads
```

---

# Fase 8 — Memoria

Implementar:

```text
Usuario
 ↓
Identificación
 ↓
Convex
 ↓
Customer Memory
 ↓
GPT Realtime
```

---

# Fase 9 — Sales Agent

Diseñar:

- personalidad;
- pitch;
- preguntas;
- manejo de objeciones;
- estrategia comercial;
- reglas de conversación;
- cierre;
- seguimiento.

---

# Fase 10 — Learning Loop

Implementar:

```text
Conversaciones
 ↓
Analyzer
 ↓
Customer Memory
 ↓
Sales Insights
 ↓
Agent Strategy
```

---

# Fase 11 — Producción

Optimizar:

- latencia;
- calidad de audio;
- estabilidad WiFi;
- reconexión;
- seguridad;
- costos;
- observabilidad;
- escalabilidad.

---

# 26. WebRTC vs WebSocket

## Primera opción: WebRTC directo

```text
ESP32
 ↓
WiFi
 ↓
WebRTC
 ↓
OpenAI Realtime
```

Esta será la arquitectura que intentaremos primero.

Ventajas:

- No requiere un servidor intermedio para el audio.
- Menor complejidad de infraestructura.
- Comunicación realtime.
- Audio bidireccional.
- Arquitectura más directa.

Espressif tiene una solución específica para este escenario.

---

## Alternativa: WebSocket

Si WebRTC resulta demasiado complejo o incompatible con nuestro hardware:

```text
ESP32
 ↓
WebSocket
 ↓
Backend
 ↓
OpenAI Realtime
```

Esta opción queda como fallback.

OpenAI Realtime soporta WebRTC y WebSocket, entre otros transportes.

---

# 27. No utilizar una VPS inicialmente

No forma parte del MVP:

```text
❌ VPS
❌ Robot Gateway
❌ servidor de audio intermedio
```

Solamente se añadirá infraestructura adicional si una necesidad técnica lo justifica.

La arquitectura inicial será:

```text
ESP32
   │
   │ WebRTC
   ▼
OpenAI Realtime
   │
   │ Tools
   ▼
Convex
```

---

# 28. Responsabilidades

## ESP32

```text
WiFi
Audio input
Audio output
WebRTC
Hardware
```

## OpenAI Realtime

```text
Speech understanding
Reasoning
Conversation
Tool selection
Voice generation
```

## Convex

```text
Customers
History
Memory
Products
Leads
Analytics
Persistence
```

## Analyzer

```text
Conversation analysis
Customer insights
Sales insights
Learning loop
```

---

# 29. Principio de memoria

La memoria permanente **no dependerá de que GPT recuerde conversaciones anteriores por sí mismo**.

La fuente de verdad será:

```text
Convex
```

GPT recibirá el contexto necesario mediante:

```text
tools
+
session context
+
instructions
```

Por ejemplo:

```text
Convex:

Juan
├── previous conversations
├── interests
├── objections
└── sales stage
```

GPT utilizará esa información durante la conversación.

---

# 30. Principio de aprendizaje

No se intentará "reentrenar GPT" después de cada conversación.

El aprendizaje inicial será:

```text
Más conversaciones
       ↓
Más datos
       ↓
Mejor memoria
       ↓
Mejores insights
       ↓
Mejor estrategia
       ↓
Mejor comportamiento del agente
```

Posteriormente se podrá evaluar:

- fine-tuning;
- evaluación automática;
- prompt optimization;
- A/B testing;
- modelos especializados;
- análisis estadístico de conversaciones.

---

# 31. MVP mínimo

El primer MVP debe conseguir únicamente:

```text
        🤖 ESP32
       🎤     🔊
        │     ▲
        │     │
        ▼     │
   WebRTC / WiFi
        │
        ▼
OpenAI Realtime
        │
        ▼
     respuesta
        │
        ▼
      Speaker
```

Después:

```text
OpenAI
   │
   │ Tool
   ▼
Convex
```

Después:

```text
Conversation
   ↓
Memory
   ↓
Learning Loop
```

---

# 32. Resultado final esperado

El robot deberá poder mantener una conversación como:

```text
👤:
"Hola, soy Juan."

🤖:
"¡Hola Juan! Mucho gusto."

        ↓

Consulta memoria

        ↓

🤖:
"Recuerdo que estuvimos hablando
sobre automatización."

👤:
"Sí. ¿Tienen integración con Salesforce?"

        ↓

Tool call

        ↓

Convex

        ↓

🤖:
"Sí, tenemos integración con Salesforce."

👤:
"¿Cuánto cuesta?"

        ↓

get_pricing()

        ↓

Convex

        ↓

🤖:
"El plan Enterprise cuesta..."

👤:
"Quiero una demostración."

        ↓

schedule_demo()

        ↓

Convex

        ↓

🤖:
"Perfecto, he registrado tu solicitud."
```

Todo esto ocurrirá como **una conversación de audio continua**, no como una llamada telefónica.

---

# 33. Arquitectura conceptual definitiva

```text
                         🤖 ROBOT
                    ┌───────────────┐
                    │    ESP32      │
                    │               │
                    │ 🎤 Microphone │
                    │ 🔊 Speaker    │
                    │ 📡 WiFi       │
                    └───────┬───────┘
                            │
                          WebRTC
                            │
                            ▼
                 ┌────────────────────┐
                 │  OpenAI Realtime   │
                 │                    │
                 │ GPT-Realtime-2.1   │
                 │                    │
                 │ 👂 Listen          │
                 │ 🧠 Reason          │
                 │ 🔧 Tools           │
                 │ 🔊 Speak           │
                 └──────────┬─────────┘
                            │
                         Tool Calls
                            │
                            ▼
                    ┌───────────────┐
                    │    Convex     │
                    │               │
                    │ 👤 Customers  │
                    │ 💬 Messages   │
                    │ 🧠 Memory     │
                    │ 📦 Products   │
                    │ 🎯 Leads      │
                    │ 📊 Analytics  │
                    └───────┬───────┘
                            │
                            ▼
                   Conversation Analyzer
                            │
                            ▼
                     Learning Loop
                            │
                            ▼
                    Better Sales Agent
```

---

# 34. Regla fundamental del proyecto

El proyecto no busca simplemente:

> "Hacer un ESP32 que hable con ChatGPT."

Busca construir:

> **Un agente de ventas físico, realtime y con memoria, capaz de conversar naturalmente, consultar información, ejecutar acciones y mejorar mediante el análisis de sus interacciones.**

La prioridad será:

```text
1. Audio
2. WebRTC
3. OpenAI Realtime
4. Tools
5. Convex
6. Memoria
7. Sales Agent
8. Learning Loop
9. Producción
```

---

# 35. Referencias técnicas

### OpenAI — GPT-Realtime-2.1

Modelo realtime utilizado por el proyecto.

### Espressif — ESP-WebRTC Solution

Implementación de WebRTC para ESP32 y ejemplos oficiales.

### Espressif — OpenAI Realtime Demo

Demo oficial de ESP32 conectado a OpenAI Realtime mediante WebRTC, incluyendo function calling.

### OpenAI — Realtime Embedded

Repositorio oficial con recursos para utilizar Realtime API en plataformas embedded.

---

# 36. Estado actual

```text
[ ] Identificar modelo exacto de ESP32
[ ] Identificar micrófono
[ ] Identificar speaker/amplificador
[ ] Probar captura de audio
[ ] Probar reproducción de audio
[ ] Configurar ESP-IDF
[ ] Probar ESP-WebRTC
[ ] Probar OpenAI openai_demo
[ ] Conectar GPT-Realtime-2.1
[ ] Conversación básica
[ ] Interrupciones
[ ] Tools
[ ] Convex
[ ] Memoria
[ ] Persistencia
[ ] Sales Agent
[ ] Conversation Analyzer
[ ] Learning Loop
[ ] Producción
```

---

## Arquitectura inicial acordada

**ESP32 → WiFi → WebRTC → OpenAI Realtime → Tools → Convex**

No se añadirá una VPS ni un Robot Gateway hasta que exista una razón técnica para hacerlo.