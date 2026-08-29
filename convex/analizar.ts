import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { claudeJson } from "./claude";
import { unir } from "./util";

// Learning loop (specs/01 §3): al terminar cada conversación, Claude (Bedrock) extrae intereses, objeciones, etapa,
// resultado y siguiente acción; se funden en customerMemory y se recalculan los salesInsights globales.

const SYSTEM = `Analizas la transcripción de una conversación de ventas en español entre un vendedor (assistant) y un cliente
(user). Extrae solo lo que está en el texto; no inventes.
intereses: temas o funciones que al cliente le importan (2-4 palabras cada uno). objeciones: lo que frena la compra ("precio",
"tiempo de implementación"...). integraciones: sistemas que preguntó. etapa: nuevo | descubrimiento | evaluacion | propuesta |
cerrado. resultado: seguimiento | demo_agendada | perdido | venta. intencion: baja | media | alta. siguienteAccion: una frase
imperativa corta. resumen: dos frases que el vendedor pueda decir al reconocer al cliente la próxima vez ("La última vez
hablamos de X y te preocupaba Y"). Responde solo el JSON.`;

const SCHEMA = {
  type: "object",
  properties: {
    intereses: { type: "array", items: { type: "string" } },
    objeciones: { type: "array", items: { type: "string" } },
    integraciones: { type: "array", items: { type: "string" } },
    etapa: { type: "string", enum: ["nuevo", "descubrimiento", "evaluacion", "propuesta", "cerrado"] },
    resultado: { type: "string", enum: ["seguimiento", "demo_agendada", "perdido", "venta"] },
    intencion: { type: "string", enum: ["baja", "media", "alta"] },
    siguienteAccion: { type: "string" },
    resumen: { type: "string" },
  },
  required: ["intereses", "objeciones", "integraciones", "etapa", "resultado", "intencion", "siguienteAccion", "resumen"],
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
      .map((m) => (m.rol === "tool" ? `[tool ${m.tool}] ${m.texto}` : `${m.rol === "user" ? "Cliente" : "Vendedor"}: ${m.texto}`))
      .join("\n");
    const cliente = conv.customerId ? await ctx.db.get(conv.customerId) : null;
    return { texto, cliente: cliente ? { nombre: cliente.nombre, empresa: cliente.empresa ?? null, etapa: cliente.etapa } : null, resultadoActual: conv.resultado ?? null };
  },
});

export const aplicar = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    intereses: v.array(v.string()),
    objeciones: v.array(v.string()),
    integraciones: v.array(v.string()),
    etapa: v.string(),
    resultado: v.string(),
    siguienteAccion: v.string(),
    resumen: v.string(),
  },
  handler: async (ctx, a) => {
    const conv = await ctx.db.get(a.conversationId);
    if (!conv) return;
    const resultado = conv.resultado ?? (a.resultado as any); // schedule_demo ya pudo marcar demo_agendada
    await ctx.db.patch(conv._id, { resultado, resumen: a.resumen || conv.resumen });
    if (conv.customerId) {
      const m = await ctx.db
        .query("customerMemory")
        .withIndex("by_customer", (q) => q.eq("customerId", conv.customerId!))
        .first();
      const datos = {
        customerId: conv.customerId,
        intereses: unir(m?.intereses ?? [], a.intereses),
        objeciones: unir(m?.objeciones ?? [], a.objeciones),
        integraciones: unir(m?.integraciones ?? [], a.integraciones),
        resumen: a.resumen || m?.resumen || "",
        siguienteAccion: a.siguienteAccion || m?.siguienteAccion,
        actualizado: Date.now(),
      };
      if (m) await ctx.db.patch(m._id, datos);
      else await ctx.db.insert("customerMemory", datos);
      const c = await ctx.db.get(conv.customerId);
      const orden = ["nuevo", "descubrimiento", "evaluacion", "propuesta", "cerrado"];
      if (c && orden.indexOf(a.etapa) > orden.indexOf(c.etapa)) await ctx.db.patch(c._id, { etapa: a.etapa as any });
    }
    await recalcularInsights(ctx);
  },
});

async function recalcularInsights(ctx: any) {
  const memorias = await ctx.db.query("customerMemory").collect();
  const convs = await ctx.db.query("conversations").collect();
  const mensajes = await ctx.db.query("messages").collect();

  const cuenta = (xs: string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  };
  const objeciones = cuenta(memorias.flatMap((m: any) => m.objeciones));
  const productos = cuenta(
    mensajes
      .filter((m: any) => m.rol === "tool" && (m.tool === "get_pricing" || m.tool === "get_product_info"))
      .map((m: any) => {
        try {
          return String(JSON.parse(m.args ?? "{}").producto ?? "").toLowerCase();
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
  const cerradas = convs.filter((c: any) => c.fin);
  const demos = cerradas.filter((c: any) => c.resultado === "demo_agendada").length;

  const set = async (clave: string, valor: string, evidencia: number) => {
    const fila = await ctx.db
      .query("salesInsights")
      .withIndex("by_clave", (q: any) => q.eq("clave", clave))
      .first();
    const datos = { clave, valor, evidencia, actualizado: Date.now() };
    if (fila) await ctx.db.patch(fila._id, datos);
    else await ctx.db.insert("salesInsights", datos);
  };
  if (objeciones.length) await set("objecion_frecuente", objeciones[0][0], objeciones[0][1]);
  if (productos.length) await set("producto_mas_preguntado", productos[0][0], productos[0][1]);
  if (cerradas.length) await set("tasa_demo", `${Math.round((100 * demos) / cerradas.length)} % de las conversaciones terminan en demo`, cerradas.length);
}

export const correr = internalAction({
  args: { conversationId: v.id("conversations"), transcript: v.optional(v.string()) },
  handler: async (ctx, { conversationId, transcript }) => {
    const d = await ctx.runQuery(internal.analizar.datos, { conversationId });
    if (!d) return;
    const texto = d.texto.trim().length >= 40 ? d.texto : (transcript ?? "").trim();
    if (texto.length < 20) return; // conversación vacía: nada que aprender
    try {
      const r = await claudeJson({
        system: SYSTEM,
        usuario: JSON.stringify({ cliente: d.cliente, transcripcion: texto.slice(0, 12000) }),
        schema: SCHEMA,
        maxTokens: 600,
        timeoutMs: 25000,
      });
      await ctx.runMutation(internal.analizar.aplicar, {
        conversationId,
        intereses: (r.intereses ?? []).map(String),
        objeciones: (r.objeciones ?? []).map(String),
        integraciones: (r.integraciones ?? []).map(String),
        etapa: String(r.etapa ?? "descubrimiento"),
        resultado: String(r.resultado ?? "seguimiento"),
        siguienteAccion: String(r.siguienteAccion ?? ""),
        resumen: String(r.resumen ?? ""),
      });
    } catch (e) {
      console.error("analizar falló:", String(e));
    }
  },
});
