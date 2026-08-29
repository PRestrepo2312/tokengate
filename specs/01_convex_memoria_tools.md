# 01 — Convex: memoria, tools y analizador

Convex es la fuente de verdad. El modelo de voz nunca toca la base directamente: pide por tools, recibe texto corto en español
listo para decirse en voz alta.

## 1. Tablas (`convex/schema.ts`, ya escrito)

| Tabla | Campos clave | Para qué |
|---|---|---|
| `customers` | `nombre`, `nombreNorm`, `empresa?`, `rol?`, `etapa` (`nuevo · descubrimiento · evaluacion · propuesta · cerrado`), `ultimaVez?` | Un cliente por persona; se busca por nombre normalizado y por primer nombre (como LUMI). |
| `customerMemory` | `customerId`, `intereses[]`, `objeciones[]`, `integraciones[]`, `resumen`, `siguienteAccion?` | Lo que sobrevive a la sesión. Se actualiza por tool y por el analizador. |
| `conversations` | `customerId?`, `inicio`, `fin?`, `canal` (`vapi · navegador · esp32`), `resultado?` (`seguimiento · demo_agendada · perdido · venta`), `vapiCallId?` | Una por llamada. |
| `messages` | `conversationId`, `rol` (`user · assistant · tool`), `texto`, `t`, `tool?`, `args?`, `resultado?` | Transcript + tool calls, para historial, análisis y debugging. |
| `products` | `nombre`, `descripcion`, `precio`, `moneda`, `periodo`, `caracteristicas[]`, `integraciones[]` | Catálogo (seed). |
| `leads` | `customerId`, `producto?`, `intencion` (`baja · media · alta`), `nota`, `creado` | Lo que crea `create_lead`. |
| `demos` | `customerId`, `cuando` (texto tal como lo dijo), `nota`, `creado` | Lo que crea `schedule_demo`. |
| `salesInsights` | `clave` (`objecion_frecuente`, `pitch_efectivo`, `momento_demo`...), `valor`, `evidencia` (n), `actualizado` | Learning loop global, calculado por el analizador. |

Índices: `customers.by_nombre`, `customerMemory.by_customer`, `conversations.by_customer`, `messages.by_conversation`,
`leads.by_customer`, `demos.by_customer`, `salesInsights.by_clave`.

## 2. Tools (contrato con Vapi)

Vapi hace `POST https://<deployment>.convex.site/vapi` con `message.type == "tool-calls"` y una lista `toolCallList` de
`{id, name, arguments}`. Se responde `200` con `{"results": [{"toolCallId": id, "result": "texto"}]}`. Cada `result` es una
frase o dos, en español, **para ser dicha**: nada de JSON crudo al modelo.

| Tool | Args | Qué hace | Resultado ejemplo |
|---|---|---|---|
| `get_customer_context` | `nombre`, `empresa?` | Busca cliente (exacto → primer nombre). Si no existe, lo crea con etapa `nuevo`. Asocia la conversación. | "Juan, de Acme, CTO. Hablamos hace 3 días de automatización; le preocupaba el precio. Etapa: evaluación." / "Cliente nuevo." |
| `get_product_info` | `producto?` | Catálogo o ficha de un producto. | "Enterprise: SSO, integración con Salesforce, soporte 24/7." |
| `get_pricing` | `producto` | Precio y periodo. | "Enterprise cuesta 999 dólares al mes, facturación mensual." |
| `get_previous_conversations` | `nombre` | Últimas 3 conversaciones resumidas. | "Dos conversaciones: 26-ago sobre integraciones; 27-ago pidió precios." |
| `save_customer_memory` | `nombre`, `intereses?[]`, `objeciones?[]`, `integraciones?[]`, `etapa?`, `nota?` | Actualiza `customerMemory` y `customers.etapa`. | "Anotado." |
| `create_lead` | `nombre`, `producto?`, `intencion`, `nota?` | Inserta lead. | "Lead creado para Enterprise con intención alta." |
| `schedule_demo` | `nombre`, `cuando`, `nota?` | Inserta demo. | "Demo agendada para el martes a las 10." |

Reglas: toda tool recibe `nombre` porque Vapi no manda identidad; el modelo lo sabe porque la persona se presentó. Si el
modelo llama a una tool sin nombre conocido, la respuesta es "¿Me recuerdas tu nombre?" y no se escribe nada.

Además de tool-calls, el mismo endpoint recibe `message.type == "transcript"` (guardar en `messages`), `"status-update"`
(inicio/fin de llamada → `conversations`) y `"end-of-call-report"` (dispara el analizador). Todo lo demás se ignora con `200`.

## 3. Analizador (learning loop) — `convex/analizar.ts`

Al terminar la llamada (`end-of-call-report` o `status-update: ended`): action con **Claude por Bedrock** (copiar
`../Nomi/convex/bedrock.ts` y `claude.ts`; la cuenta de Andrey ya tiene las credenciales, `npx convex env set` igual que en
LUMI) sobre el transcript → JSON:

```json
{ "intereses": [], "objeciones": [], "integraciones": [], "etapa": "evaluacion", "resultado": "seguimiento",
  "intencion": "alta", "siguienteAccion": "agendar demo", "resumen": "2 frases" }
```

→ merge en `customerMemory` (unión de listas, resumen reemplaza), `customers.etapa`, `conversations.resultado`. Luego recuenta
`salesInsights`: objeción más frecuente, producto más preguntado, % de conversaciones que terminan en demo.

Gotcha heredado de LUMI: la salida estructurada de Bedrock **no admite `minimum/maximum/minItems` ni `null`** en el esquema.

## 4. Seed (`convex/seed.ts`, `npx convex run seed:productos`)

Tres productos para la demo, con precios y una integración con Salesforce en el de arriba (el documento lo usa de ejemplo).
Un cliente precargado ("Juan, de Acme, CTO, interesado en automatización, objeción: precio, etapa evaluación") para que la
segunda conversación del pitch tenga memoria desde el primer intento.

## 5. Lo que el analizador NO hace

Reentrenar nada, tocar prompts solos, ni borrar memoria. Los insights se muestran en el panel de `web/`; cambiar el
comportamiento del vendedor a partir de ellos es una decisión humana (o una frase en el prompt del asistente).
