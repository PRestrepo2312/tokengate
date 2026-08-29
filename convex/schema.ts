import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// TOKENGATE — memoria persistente del vendedor (specs/01 §1). Convex es la fuente de verdad; el modelo de voz solo
// la toca por tools. Etapas y resultados como strings cerrados para que el analizador y el panel hablen el mismo idioma.

export const etapa = v.union(
  v.literal("nuevo"),
  v.literal("descubrimiento"),
  v.literal("evaluacion"),
  v.literal("propuesta"),
  v.literal("cerrado"),
);

export const resultado = v.union(
  v.literal("seguimiento"),
  v.literal("demo_agendada"),
  v.literal("perdido"),
  v.literal("venta"),
);

export const intencion = v.union(v.literal("baja"), v.literal("media"), v.literal("alta"));

export default defineSchema({
  customers: defineTable({
    nombre: v.string(),
    nombreNorm: v.string(), // minúsculas, sin tildes: llave de búsqueda (también por primer nombre)
    empresa: v.optional(v.string()),
    rol: v.optional(v.string()),
    etapa: etapa,
    ultimaVez: v.optional(v.number()),
  }).index("by_nombre", ["nombreNorm"]),

  // Memoria del coach sobre cada persona que practica su pitch (specs: Sales Pitch Coach).
  customerMemory: defineTable({
    customerId: v.id("customers"),
    intereses: v.array(v.string()), // (heredado) temas que le importan
    objeciones: v.array(v.string()), // (heredado) objeciones que ha recibido de sus clientes
    integraciones: v.array(v.string()), // (heredado)
    resumen: v.string(), // 2 frases que el coach dice al reconocer a la persona: "La última vez trabajamos..."
    siguienteAccion: v.optional(v.string()),
    actualizado: v.number(),
    producto: v.optional(v.string()), // qué vende
    audiencia: v.optional(v.string()), // a quién
    problema: v.optional(v.string()), // qué problema resuelve
    diferencial: v.optional(v.string()),
    fortalezas: v.optional(v.array(v.string())),
    debilidades: v.optional(v.array(v.string())),
    feedback: v.optional(v.array(v.string())), // recomendaciones dadas
    objetivo: v.optional(v.string()), // qué quiere lograr con el pitch
    progreso: v.optional(v.string()), // cómo va sesión a sesión
    sesiones: v.optional(v.number()),
  }).index("by_customer", ["customerId"]),

  // Versiones del pitch de cada persona.
  pitches: defineTable({
    customerId: v.id("customers"),
    texto: v.string(),
    version: v.number(),
    feedback: v.optional(v.string()),
    puntaje: v.optional(v.number()), // 0-10 del coach
    creado: v.number(),
  }).index("by_customer", ["customerId"]),

  conversations: defineTable({
    customerId: v.optional(v.id("customers")),
    inicio: v.number(),
    fin: v.optional(v.number()),
    canal: v.union(v.literal("vapi"), v.literal("navegador"), v.literal("esp32")),
    resultado: v.optional(resultado),
    vapiCallId: v.optional(v.string()),
    resumen: v.optional(v.string()),
  }).index("by_customer", ["customerId"]).index("by_vapi", ["vapiCallId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    rol: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool")),
    texto: v.string(),
    t: v.number(), // segundos desde el inicio de la conversación
    tool: v.optional(v.string()),
    args: v.optional(v.string()), // JSON
    resultado: v.optional(v.string()),
  }).index("by_conversation", ["conversationId"]),

  products: defineTable({
    nombre: v.string(),
    nombreNorm: v.string(),
    descripcion: v.string(),
    precio: v.number(),
    moneda: v.string(),
    periodo: v.string(), // "mes" | "año" | "único"
    caracteristicas: v.array(v.string()),
    integraciones: v.array(v.string()),
  }).index("by_nombre", ["nombreNorm"]),

  leads: defineTable({
    customerId: v.id("customers"),
    producto: v.optional(v.string()),
    intencion: intencion,
    nota: v.optional(v.string()),
    creado: v.number(),
  }).index("by_customer", ["customerId"]),

  demos: defineTable({
    customerId: v.id("customers"),
    cuando: v.string(), // tal como lo dijo la persona ("el martes a las 10")
    nota: v.optional(v.string()),
    creado: v.number(),
  }).index("by_customer", ["customerId"]),

  // Learning loop global (specs/01 §3): lo calcula el analizador al terminar cada conversación.
  salesInsights: defineTable({
    clave: v.string(), // objecion_frecuente · producto_mas_preguntado · tasa_demo · pitch_efectivo
    valor: v.string(),
    evidencia: v.number(), // cuántas conversaciones lo respaldan
    actualizado: v.number(),
  }).index("by_clave", ["clave"]),

  // Estado del cuerpo (specs/03): lo escribe web/ con los eventos de Vapi; lo lee robot/puente.py.
  cuerpo: defineTable({
    estado: v.union(
      v.literal("idle"),
      v.literal("escuchando"),
      v.literal("pensando"),
      v.literal("hablando"),
      v.literal("anotando"),
    ),
    t: v.number(),
  }),
});
