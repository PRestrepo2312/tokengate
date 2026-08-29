# 04 — Demo y pitch (3 minutos, sin slides)

## La frase

> TOKENGATE es un vendedor que se acuerda de ti. Le hablas, te reconoce, te da el precio real, te agenda la demo, y la próxima
> vez retoma donde quedaron.

## Guion

| Tiempo | Qué pasa |
|---|---|
| 0:00 | Persona 1 se acerca al robot: "Hola, soy Juan, de Acme." El robot (cuerpo en `pensando` → `hablando`): "Juan, de Acme. La última vez hablamos de automatización y te preocupaba el precio. ¿Seguimos por ahí?" (memoria precargada, `specs/01` §4). |
| 0:25 | "¿Tienen integración con Salesforce?" → `get_product_info` → "Sí, en Enterprise, con SSO y soporte 24/7." |
| 0:40 | "¿Y cuánto cuesta?" → `get_pricing` → "Enterprise cuesta 999 dólares al mes." Persona 1 interrumpe a mitad de frase: "¿Y anual?" → el robot para y responde (barge-in, Vapi). |
| 1:00 | "Quiero una demo el martes a las 10." → `schedule_demo` + `create_lead` → "Agendada para el martes a las 10. Te la registré con intención alta." Cuelga. |
| 1:15 | Presentador: "Se llama TOKENGATE. Cada conversación queda en Convex: quién, qué preguntó, qué objetó, en qué etapa va." Muestra el panel: el cliente Juan, su memoria actualizada por el analizador, y el insight global ("objeción más frecuente: precio"). |
| 1:45 | **Alguien del jurado** habla con el robot 30 s (se presenta con su nombre y empresa). El robot lo trata como cliente nuevo, responde precios, y al colgar aparece su ficha en el panel, creada por el analizador. |
| 2:30 | El mismo jurado vuelve a hablar: "Hola, soy [nombre] otra vez." → el robot retoma: "Hace un minuto me preguntaste por el plan Pro." **Ese es el momento.** |
| 2:50 | "El ESP32 es el cuerpo; el cerebro conversacional es Vapi; la memoria y el aprendizaje son Convex. Mañana el mismo cerebro cabe en una S3 con WebRTC directo, sin portátil." Fin. |

## Reglas

- Micrófono cerca de la boca (el del portátil o el USB dentro del cuerpo); el salón tiene 40 personas.
- Hotspot del celular, nunca el WiFi del venue.
- La memoria precargada de Juan existe desde el seed: el primer intercambio nunca depende de una conversación anterior real.
- Ensayar con cronómetro tres veces desde las 19:00. Video de respaldo a las 18:30.

## Cronograma de la tarde

Ver `specs/00` §5. Hitos: 14:30 primera conversación con precio real desde el dashboard de Vapi; 16:00 conversación desde la
página con panel; 17:30 memoria entre dos conversaciones; 18:30 freeze.
