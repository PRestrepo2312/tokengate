# TOKENGATE — Tools para el asistente de Vapi

Todo lo que hay que pegar en el dashboard de Vapi (https://dashboard.vapi.ai) para que el vendedor consulte y escriba en Convex.
El backend ya está desplegado y probado; las tools responden **frases en español listas para decirse**, no JSON.

## 1. Datos fijos

| Campo | Valor |
|---|---|
| **Server URL** (webhook, para las 7 tools y para el asistente) | `https://honorable-capybara-700.convex.site/vapi` |
| Método | POST, JSON. Vapi manda `message.type = "tool-calls"` y el backend responde `{"results":[{"toolCallId","result"}]}` |
| Salud del backend | `GET https://honorable-capybara-700.convex.site/salud` → `{"ok":true,"proyecto":"tokengate"}` |
| Server messages del asistente | `tool-calls`, `transcript`, `status-update`, `end-of-call-report` |
| Client messages | `transcript`, `speech-update`, `status-update`, `tool-calls` |

## 2. Asistente

- **Nombre:** TOKENGATE
- **First message:** `Hola. Soy el vendedor de TOKENGATE. ¿Con quién hablo y de qué empresa?`
- **Transcriber:** Deepgram · modelo `nova-3` · idioma `es`
- **Voice:** ElevenLabs · una voz en español (elegir en Voices) · modelo `eleven_flash_v2_5`
- **Model:** OpenAI `gpt-4o` (o el que prefieran) · temperature `0.4`
- **Silence timeout:** 30 s · **Max duration:** 600 s
- **End call message:** `Gracias. Quedo pendiente del siguiente paso.`

### System prompt (pegar completo)

```
Eres el vendedor de TOKENGATE, un robot vendedor con memoria que se vende a sí mismo. Hablas español neutro, frases cortas, tono cálido y directo; nunca lees listas largas ni repites el nombre de la persona en cada frase.

Primero pregunta con quién hablas y de qué empresa; en cuanto lo sepas, llama get_customer_context con nombre y empresa. Si hay historial, úsalo de forma natural ("la última vez hablamos de...").

Nunca inventes precios, funciones ni integraciones: usa get_pricing y get_product_info. Cuando detectes un interés, una objeción o una integración que preguntan, llama save_customer_memory. Si la persona pide una demostración, llama schedule_demo con el momento tal como lo dijo y confirma en una frase. Si la intención de compra es clara, llama create_lead.

Si te interrumpen, para y escucha. Cierra siempre con un siguiente paso concreto. Respuestas de máximo dos frases salvo que pidan detalle.
```

## 3. Las 7 tools

En Vapi: **Tools → Create tool → Function**. Para cada una: nombre, descripción, parámetros (JSON Schema) y **Server URL** =
`https://honorable-capybara-700.convex.site/vapi`. Luego, en el asistente, **Tools → añadir las 7**. Todas son **server-side**
(el modelo necesita el resultado para seguir), ninguna `async`.

### 3.1 `get_customer_context`

Descripción: `Busca al cliente por su nombre (y empresa) y devuelve su historial: etapa, intereses, objeciones, última conversación. Si no existe, lo registra. Llamar en cuanto la persona diga su nombre.`

```json
{
  "type": "object",
  "properties": {
    "nombre": { "type": "string", "description": "Nombre de la persona tal como lo dijo" },
    "empresa": { "type": "string", "description": "Empresa, si la dijo" },
    "rol": { "type": "string", "description": "Cargo, si lo dijo" }
  },
  "required": ["nombre"]
}
```

Responde, por ejemplo: `Juan, de Acme (CTO). Etapa: evaluación. La última vez hablamos de automatizar la atención en su stand y te preocupaba el precio del plan Enterprise. Intereses: automatización y inteligencia artificial. Objeciones: precio. Integraciones que preguntó: Salesforce. Siguiente paso pendiente: mostrar el retorno antes de hablar de precio. Última conversación hace 3 días.` — o `Cliente nuevo: Camila, de Bancolombia. Registrado. No hay historial: descubre qué necesita.`

### 3.2 `get_product_info`

Descripción: `Ficha de un producto (qué incluye, integraciones) o el catálogo completo si no se indica producto.`

```json
{
  "type": "object",
  "properties": {
    "producto": { "type": "string", "description": "Starter, Pro o Enterprise. Vacío = catálogo completo" }
  }
}
```

Responde: `Pro: para equipos comerciales: varios robots y memoria compartida. Incluye hasta 5 robots, memoria ilimitada, agenda de demos y insights de objeciones. Integraciones: HubSpot y Google Calendar.`

### 3.3 `get_pricing`

Descripción: `Precio real de un producto. Usar siempre antes de decir un precio.`

```json
{
  "type": "object",
  "properties": {
    "producto": { "type": "string", "description": "Starter, Pro o Enterprise" }
  },
  "required": ["producto"]
}
```

Responde: `Enterprise cuesta 999 dólares al mes.`

### 3.4 `get_previous_conversations`

Descripción: `Resumen de las últimas conversaciones con un cliente.`

```json
{
  "type": "object",
  "properties": {
    "nombre": { "type": "string" }
  },
  "required": ["nombre"]
}
```

Responde: `1 conversación: 26 ago, preguntó por automatización e integración con Salesforce; objeción de precio (seguimiento).`

### 3.5 `save_customer_memory`

Descripción: `Guarda lo aprendido del cliente durante la conversación: intereses, objeciones, integraciones que preguntó, etapa de venta y una nota.`

```json
{
  "type": "object",
  "properties": {
    "nombre": { "type": "string" },
    "empresa": { "type": "string" },
    "intereses": { "type": "array", "items": { "type": "string" } },
    "objeciones": { "type": "array", "items": { "type": "string" } },
    "integraciones": { "type": "array", "items": { "type": "string" } },
    "etapa": { "type": "string", "enum": ["nuevo", "descubrimiento", "evaluacion", "propuesta", "cerrado"] },
    "nota": { "type": "string", "description": "Una o dos frases para recordar la próxima vez" },
    "siguienteAccion": { "type": "string" }
  },
  "required": ["nombre"]
}
```

Responde: `Anotado.`

### 3.6 `create_lead`

Descripción: `Registra un lead cuando hay intención de compra.`

```json
{
  "type": "object",
  "properties": {
    "nombre": { "type": "string" },
    "empresa": { "type": "string" },
    "producto": { "type": "string" },
    "intencion": { "type": "string", "enum": ["baja", "media", "alta"] },
    "nota": { "type": "string" }
  },
  "required": ["nombre", "intencion"]
}
```

Responde: `Lead creado para Enterprise con intención alta.`

### 3.7 `schedule_demo`

Descripción: `Agenda una demostración. cuando es el momento tal como lo dijo la persona.`

```json
{
  "type": "object",
  "properties": {
    "nombre": { "type": "string" },
    "empresa": { "type": "string" },
    "cuando": { "type": "string", "description": "Tal como lo dijo: 'el martes a las 10'" },
    "nota": { "type": "string" }
  },
  "required": ["nombre", "cuando"]
}
```

Responde: `Demo agendada para el martes a las 10. Te la confirmo por correo.`

## 4. Qué pasa detrás (para explicarlo en el pitch)

- Cada llamada crea una **conversación** en Convex; los `transcript` finales se guardan como mensajes; cada tool queda registrada.
- Al colgar (`end-of-call-report`), un **analizador con Claude (Bedrock)** extrae intereses, objeciones, integraciones, etapa,
  resultado y un resumen de dos frases → actualiza la **memoria del cliente** y recalcula los **insights globales**
  (objeción más frecuente, producto más preguntado, % de conversaciones que terminan en demo).
- La próxima vez que esa persona se presente, `get_customer_context` devuelve todo eso y el vendedor retoma el contexto.

## 5. Prueba desde el dashboard (antes de la página)

"Talk to assistant" y decir:

1. `Hola, soy Juan, de Acme.` → debe llamar `get_customer_context` y responder con la memoria precargada de Juan (automatización, Salesforce, precio).
2. `¿Cuánto cuesta el Enterprise?` → `get_pricing` → 999 dólares al mes.
3. `Quiero una demo el martes a las 10.` → `schedule_demo` → confirmación.
4. Colgar. En Convex (`npx convex run panel:clientes`) Juan debe tener la memoria actualizada por el analizador.

Prueba directa del webhook sin Vapi (PowerShell):

```powershell
curl.exe -s -X POST https://honorable-capybara-700.convex.site/vapi -H "content-type: application/json" -d '{"message":{"type":"tool-calls","call":{"id":"prueba"},"toolCallList":[{"id":"t1","name":"get_pricing","arguments":{"producto":"Enterprise"}}]}}'
```

## 6. Alternativa: crear el asistente por API

`vapi/asistente.json` tiene todo lo de arriba en el formato de la API. Con la **Private Key**:

```powershell
$env:VAPI_PRIVATE_KEY="..."
python vapi/crear_asistente.py          # imprime el assistant id
```

(Antes cambiar `voice.voiceId` en el JSON por una voz en español.) El **Assistant ID** y la **Public Key** van en `web/.env.local`
como `VITE_VAPI_ASSISTANT_ID` y `VITE_VAPI_PUBLIC_KEY` para la página con el botón "Hablar con el vendedor".
