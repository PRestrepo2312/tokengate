import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { claudeJson } from "./claude";
import { unir } from "./util";

// Learning loop del COACH: al terminar cada sesión, Claude (Bedrock) extrae qué vende la persona, a quién, fortalezas,
// debilidades, el feedback que se le dio, el pitch tal como lo dijo (si lo presentó) y un resumen para la próxima vez.

const SYSTEM = `Analizas la transcripción de una sesión entre Tokenpirin (assistant), un robot que acompaña a niños con sus tareas, y
un niño o niña (user). Extrae solo lo que está en el texto; no inventes.
producto: el tema que trabajaron (2-6 palabras, p. ej. "fracciones con distinto denominador"). audiencia: edad o grado si se
dijo. problema: lo que más le costó. diferencial: lo que le gusta (para ejemplos futuros). objetivo: qué quería lograr (la tarea,
un examen). fortalezas: logros de la sesión (2-4 palabras cada uno). debilidades: dificultades concretas. feedback: las
explicaciones o trucos que funcionaron (1-3). pitch: cadena vacía. puntaje: 0-10 de cuánto avanzó en la sesión. progreso: una
frase comparando con lo anterior si hay contexto. resumen: dos frases que Token pueda decir al reconocer al niño la próxima vez
("La última vez estábamos con X y te costaba Y"). Responde solo el JSON.`;

const SCHEMA = {
  type: "object",
  properties: {
    producto: { type: "string" },
    audiencia: { type: "string" },
    problema: { type: "string" },
    diferencial: { type: "string" },
    objetivo: { type: "string" },
    fortalezas: { type: "array", items: { type: "string" } },
    debilidades: { type: "array", items: { type: "string" } },
    feedback: { type: "array", items: { type: "string" } },
    pitch: { type: "string" },
    puntaje: { type: "integer" },
    progreso: { type: "string" },
    resumen: { type: "string" },
  },
  required: ["producto", "audiencia", "problema", "diferencial", "objetivo", "fortalezas", "debilidades", "feedback", "pitch", "puntaje", "progreso", "resumen"],
  additionalProperties: false,
};

export const datos = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const conv = await ctx.db.get(conversationId);
    if (!conv) return null;
    const ms = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .collect();
    const texto = ms
      .sort((a, b) => a.t - b.t)
      .map((m) => (m.rol === "tool" ? `[tool ${m.tool}] ${m.texto}` : `${m.rol === "user" ? "Persona" : "Coach"}: ${m.texto}`))
      .join("\n");
    const cliente = conv.customerId ? await ctx.db.get(conv.customerId) : null;
    const memoria = conv.customerId
      ? await ctx.db.query("customerMemory").withIndex("by_customer", (q) => q.eq("customerId", conv.customerId!)).first()
      : null;
    return {
      texto,
      cliente: cliente ? { nombre: cliente.nombre, empresa: cliente.empresa ?? null } : null,
      memoriaPrevia: memoria
        ? { producto: memoria.producto ?? null, debilidades: memoria.debilidades ?? [], fortalezas: memoria.fortalezas ?? [], progreso: memoria.progreso ?? null }
        : null,
    };
  },
});

export const aplicar = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    producto: v.string(),
    audiencia: v.string(),
    problema: v.string(),
    diferencial: v.string(),
    objetivo: v.string(),
    fortalezas: v.array(v.string()),
    debilidades: v.array(v.string()),
    feedback: v.array(v.string()),
    pitch: v.string(),
    puntaje: v.number(),
    progreso: v.string(),
    resumen: v.string(),
  },
  handler: async (ctx, a) => {
    const conv = await ctx.db.get(a.conversationId);
    if (!conv) return;
    await ctx.db.patch(conv._id, { resultado: conv.resultado ?? "seguimiento", resumen: a.resumen || conv.resumen });
    if (!conv.customerId) return;
    const m = await ctx.db
      .query("customerMemory")
      .withIndex("by_customer", (q) => q.eq("customerId", conv.customerId!))
      .first();
    const datos = {
      customerId: conv.customerId,
      intereses: m?.intereses ?? [],
      objeciones: m?.objeciones ?? [],
      integraciones: m?.integraciones ?? [],
      resumen: a.resumen || m?.resumen || "",
      siguienteAccion: m?.siguienteAccion,
      actualizado: Date.now(),
      producto: a.producto || m?.producto,
      audiencia: a.audiencia || m?.audiencia,
      problema: a.problema || m?.problema,
      diferencial: a.diferencial || m?.diferencial,
      objetivo: a.objetivo || m?.objetivo,
      fortalezas: unir(m?.fortalezas ?? [], a.fortalezas),
      debilidades: unir(m?.debilidades ?? [], a.debilidades),
      feedback: [...(m?.feedback ?? []), ...a.feedback].slice(-8),
      progreso: a.progreso || m?.progreso,
      sesiones: (m?.sesiones ?? 0) + 1,
    };
    if (m) await ctx.db.patch(m._id, datos);
    else await ctx.db.insert("customerMemory", datos);
    if (a.pitch.trim().length >= 20) {
      const previos = await ctx.db.query("pitches").withIndex("by_customer", (q) => q.eq("customerId", conv.customerId!)).collect();
      await ctx.db.insert("pitches", {
        customerId: conv.customerId,
        texto: a.pitch.trim(),
        version: previos.length + 1,
        feedback: a.feedback[0],
        puntaje: Math.max(0, Math.min(10, Math.round(a.puntaje))),
        creado: Date.now(),
      });
    }
    await recalcularInsights(ctx);
  },
});

// Insights globales: qué debilidades se repiten entre todas las personas, puntaje medio, cuántas sesiones.
async function recalcularInsights(ctx: any) {
  const memorias = await ctx.db.query("customerMemory").collect();
  const pitches = await ctx.db.query("pitches").collect();
  const cuenta = (xs: string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  };
  const deb = cuenta(memorias.flatMap((m: any) => m.debilidades ?? []));
  const fort = cuenta(memorias.flatMap((m: any) => m.fortalezas ?? []));
  const conPuntaje = pitches.filter((p: any) => p.puntaje != null);
  const media = conPuntaje.length ? conPuntaje.reduce((s: number, p: any) => s + p.puntaje, 0) / conPuntaje.length : 0;
  const set = async (clave: string, valor: string, evidencia: number) => {
    const fila = await ctx.db.query("salesInsights").withIndex("by_clave", (q: any) => q.eq("clave", clave)).first();
    const datos = { clave, valor, evidencia, actualizado: Date.now() };
    if (fila) await ctx.db.patch(fila._id, datos);
    else await ctx.db.insert("salesInsights", datos);
  };
  if (deb.length) await set("debilidad_mas_comun", deb[0][0], deb[0][1]);
  if (fort.length) await set("fortaleza_mas_comun", fort[0][0], fort[0][1]);
  if (conPuntaje.length) await set("puntaje_medio", `${media.toFixed(1)} sobre 10 en ${conPuntaje.length} pitches`, conPuntaje.length);
  await set("sesiones", `${memorias.reduce((s: number, m: any) => s + (m.sesiones ?? 0), 0)} sesiones con ${memorias.length} personas`, memorias.length);
}

export const correr = internalAction({
  args: { conversationId: v.id("conversations"), transcript: v.optional(v.string()) },
  handler: async (ctx, { conversationId, transcript }) => {
    const d = await ctx.runQuery(internal.analizar.datos, { conversationId });
    if (!d) return;
    const texto = d.texto.trim().length >= 40 ? d.texto : (transcript ?? "").trim();
    if (texto.length < 20) return;
    try {
      const r = await claudeJson({
        system: SYSTEM,
        usuario: JSON.stringify({ persona: d.cliente, memoria_previa: d.memoriaPrevia, transcripcion: texto.slice(0, 12000) }),
        schema: SCHEMA,
        maxTokens: 900,
        timeoutMs: 25000,
      });
      await ctx.runMutation(internal.analizar.aplicar, {
        conversationId,
        producto: String(r.producto ?? ""),
        audiencia: String(r.audiencia ?? ""),
        problema: String(r.problema ?? ""),
        diferencial: String(r.diferencial ?? ""),
        objetivo: String(r.objetivo ?? ""),
        fortalezas: (r.fortalezas ?? []).map(String),
        debilidades: (r.debilidades ?? []).map(String),
        feedback: (r.feedback ?? []).map(String),
        pitch: String(r.pitch ?? ""),
        puntaje: Number(r.puntaje) || 0,
        progreso: String(r.progreso ?? ""),
        resumen: String(r.resumen ?? ""),
      });
    } catch (e) {
      console.error("analizar falló:", String(e));
    }
  },
});
