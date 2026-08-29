# TOKENGATE — Coach de pitch con memoria (Vapi + Convex)

Concepto (29-ago, 16:20): TOKENGATE **no vende**. Es el **coach de pitch**: escucha tu pitch, te da feedback concreto, hace de
cliente para que practiques y **recuerda** qué vendes, a quién, tus pitches anteriores, fortalezas, debilidades y progreso.
Se activa diciendo **"Hola robot"** frente a la caja (micro y parlante BTS-06); el ESP32 pone la cara y el cuello.

## Estado en Vapi (ya hecho por API)

| Cosa | Valor |
|---|---|
| Asistente | **TOKENGATE coach** · id `4f7e4d61-64d7-41cf-88d6-38feae8aeb3f` (el `AI Pitch Robot` original queda intacto) |
| Modelo | OpenAI `gpt-4o` (pipeline: el realtime-mini ignoraba las tools) |
| Transcriber | Deepgram `nova-3`, `es` |
| Voz | OpenAI `alloy` (`gpt-4o-mini-tts`) |
| First message | `Hola. Soy TOKENGATE, tu coach de pitch. ¿Cómo te llamas?` |
| System prompt | `vapi/prompt_coach.md` (el prompt "Sales Pitch Coach" del equipo + sección de herramientas) |
| Server URL (webhook) | `https://honorable-capybara-700.convex.site/vapi` |
| Tools (recursos en Tools, enlazadas por toolIds) | `recordar_usuario`, `guardar_memoria`, `guardar_pitch`, `pitches_anteriores` |
| Silencio / duración | cuelga a los 25 s de silencio · máx 15 min |

## Las 4 tools

| Tool | Cuándo la llama el coach | Args | Devuelve (voz) |
|---|---|---|---|
| `recordar_usuario` | en cuanto la persona dice su nombre | `nombre`, `empresa?`, `rol?` | "Juan, de Acme. Sesión número 2. La última vez trabajamos la apertura… Vende: … a …. A mejorar: … Último pitch (versión 1, 4 sobre 10): …" o "Persona nueva: …" |
| `guardar_pitch` | cuando presenta un pitch completo (y si propone una versión mejorada) | `nombre`, `texto`, `feedback?`, `puntaje? 0-10` | "Guardada la versión 2 del pitch." |
| `guardar_memoria` | cuando aprende algo: producto, audiencia, problema, diferencial, objetivo, fortalezas, debilidades, feedback, progreso, resumen | `nombre` + esos campos (todos opcionales) | "Anotado." |
| `pitches_anteriores` | si la persona pregunta cómo iba o quiere comparar | `nombre` | "Versión 1 (4/10): … — feedback: … \| Versión 2 (8/10): …" |
| `investigar` | si la persona pregunta un dato específico (mercado, competidor, empresa, cifra) o el coach quiere verificar una afirmación del pitch | `tema`, `para?` | 2-3 frases con fuente (Tavily). Sin `TAVILY_API_KEY` responde Claude con lo que sabe y lo avisa. |

Para activar la búsqueda real: canjear Tavily (cupón del evento) y `npx convex env set TAVILY_API_KEY tvly-...` en `TOKENGATE/`.

Todas responden frases en español listas para decirse; nunca JSON.

## Qué pasa al colgar

`end-of-call-report` → analizador con **Claude (Bedrock)** extrae producto, audiencia, problema, diferencial, objetivo,
fortalezas, debilidades, feedback dado, el pitch presentado (texto + puntaje) y un resumen de dos frases → actualiza la memoria
de la persona, guarda la versión del pitch, y recalcula los insights globales (debilidad más común, fortaleza más común, puntaje
medio, sesiones). La próxima vez, `recordar_usuario` devuelve todo eso.

## Demo (guion de 3 minutos)

1. "Hola robot" → "Soy TOKENGATE, tu coach de pitch. ¿Cómo te llamas?" → "Juan, de Acme" → retoma: *"La última vez trabajamos la
   apertura: tardabas en llegar al problema y no decías cifras."* (memoria precargada por el seed, sesión 2).
2. Juan presenta su pitch (malo: empieza por la empresa). El coach escucha, señala 2 cosas, propone la versión mejorada y la
   guarda (`guardar_pitch`, 8/10).
3. "Quiero practicar" → el coach hace de cliente, pone una objeción; Juan responde; feedback.
4. Cuelga. Panel (tecla **P**): Juan con versión 1 (4/10) → versión 2 (8/10), fortalezas/debilidades, progreso; insights globales.
5. Alguien del jurado: "Hola robot", se presenta, pitch de 30 s → feedback en vivo; vuelve a hablar un minuto después y el coach
   lo reconoce.

## Probar sin voz

```powershell
curl.exe -s -X POST https://honorable-capybara-700.convex.site/vapi -H "content-type: application/json" -d '{"message":{"type":"tool-calls","call":{"id":"p"},"toolCallList":[{"id":"a","name":"recordar_usuario","arguments":{"nombre":"Juan"}}]}}'
```

Ver memoria e insights: `npx convex run panel:clientes` · `npx convex run panel:insights` · logs en vivo: `npx convex logs`.

## Arranque de la demo

```
cd "C:\Users\PEDRO.RESTREPO\Videos\Desarrollo Pedro\TOKENGATE"
..\Nomi\.venv\Scripts\python robot\arrancar.py      # Chrome modo app (micro concedido) + puente al ESP32
```
Requiere `npm run dev` en `web/` (o `--url` a la versión publicada) y el BTS-06 como micrófono/parlante por defecto de Windows.
