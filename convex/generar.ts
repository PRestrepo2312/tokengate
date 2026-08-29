import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { claudeJson } from "./claude";
import { buscarCliente, normalizar } from "./util";

// Tool `generar_pitch`: el coach pide a Claude (Bedrock) un pitch para la persona con lo que se sabe de ella (memoria + lo
// que dijo en la llamada). Devuelve el pitch en voz (<= 70 palabras) y lo guarda como versión. Modelo: TG_MODELO_PITCH
// (por defecto Opus 4.6 en Bedrock: es UNA llamada por pitch, vale la calidad).

const SYSTEM = `Escribes pitches de ventas en español para decirse EN VOZ ALTA por un coach. Reglas: máximo 70 palabras; abre
con el problema del cliente (no con la empresa); una cifra concreta si la hay (si no, no inventes: usa un marcador entre
corchetes como [cifra]); qué hace el producto en una frase; el diferencial; y cierra con un siguiente paso concreto. Frases
cortas, sin adjetivos vacíos ("integral", "sinérgico", "innovador"), sin listas. Tono natural y cercano, como se habla en
Colombia. Además da 3 notas de una frase sobre cómo decirlo (ritmo, pausa, énfasis). Responde solo el JSON.`;

const SCHEMA = {
  type: "object",
  properties: {
    pitch: { type: "string" },
    notas: { type: "array", items: { type: "string" } },
    palabras: { type: "integer" },
  },
  required: ["pitch", "notas", "palabras"],
  additionalProperties: false,
};

export const guardar = internalMutation({
  args: {
    nombre: v.string(),
    empresa: v.optional(v.string()),
    pitch: v.string(),
    notas: v.array(v.string()),
    producto: v.optional(v.string()),
    audiencia: v.optional(v.string()),
    objetivo: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<number> => {
    let c = await buscarCliente(ctx, a.nombre);
    if (!c) {
      const id = await ctx.db.insert("customers", { nombre: a.nombre.trim(), nombreNorm: normalizar(a.nombre), empresa: a.empresa, etapa: "nuevo", ultimaVez: Date.now() });
      c = (await ctx.db.get(id))!;
    }
    const m = await ctx.db.query("customerMemory").withIndex("by_customer", (q) => q.eq("customerId", c._id)).first();
    const base = {
      customerId: c._id,
      intereses: m?.intereses ?? [],
      objeciones: m?.objeciones ?? [],
      integraciones: m?.integraciones ?? [],
      resumen: m?.resumen ?? `Le generamos un pitch para ${a.producto ?? "su producto"}.`,
      actualizado: Date.now(),
      producto: a.producto || m?.producto,
      audiencia: a.audiencia || m?.audiencia,
      objetivo: a.objetivo || m?.objetivo,
      feedback: [...(m?.feedback ?? []), ...a.notas].slice(-8),
      sesiones: m?.sesiones ?? 0,
    };
    if (m) await ctx.db.patch(m._id, base);
    else await ctx.db.insert("customerMemory", base);
    const previos = await ctx.db.query("pitches").withIndex("by_customer", (q) => q.eq("customerId", c._id)).collect();
    await ctx.db.insert("pitches", { customerId: c._id, texto: a.pitch, version: previos.length + 1, feedback: "Propuesta generada por el coach.", creado: Date.now() });
    return previos.length + 1;
  },
});

export const pitch = internalAction({
  args: {
    nombre: v.string(),
    empresa: v.optional(v.string()),
    producto: v.string(),
    audiencia: v.optional(v.string()),
    problema: v.optional(v.string()),
    diferencial: v.optional(v.string()),
    objetivo: v.optional(v.string()),
    estilo: v.optional(v.string()),
    contexto: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<string> => {
    try {
      const r = await claudeJson({
        modelo: process.env.TG_MODELO_PITCH || "us.anthropic.claude-opus-4-6-v1",
        system: SYSTEM,
        usuario: JSON.stringify({
          quien: `${a.nombre}${a.empresa ? `, de ${a.empresa}` : ""}`,
          producto: a.producto,
          audiencia: a.audiencia || "no dicho: asume el cliente típico de ese producto",
          problema: a.problema || "",
          diferencial: a.diferencial || "",
          objetivo: a.objetivo || "conseguir una reunión o una prueba",
          estilo: a.estilo || "directo",
          contexto_investigado: a.contexto || "",
        }),
        schema: SCHEMA,
        maxTokens: 500,
        timeoutMs: 25000,
      });
      const texto = String(r.pitch || "").trim();
      const notas = (Array.isArray(r.notas) ? r.notas : []).map(String).slice(0, 3);
      if (!texto) return "No logré armar el pitch. Cuéntame un poco más de tu producto y lo intento de nuevo.";
      const version: number = await ctx.runMutation(internal.generar.guardar, {
        nombre: a.nombre, empresa: a.empresa, pitch: texto, notas, producto: a.producto, audiencia: a.audiencia, objetivo: a.objetivo,
      });
      return `Versión ${version} lista. Dilo así: "${texto}" ${notas.length ? `Notas: ${notas.join(" ")}` : ""}`;
    } catch (e) {
      console.error("generar_pitch falló:", String(e));
      return "No pude generar el pitch ahora mismo. Intentemos armarlo juntos: ¿cuál es el problema que le resuelves a tu cliente?";
    }
  },
});
