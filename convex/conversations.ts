import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

// Una conversación por llamada de Vapi (por callId). Las crea el webhook con status-update o el primer evento que llegue.

export const asegurar = internalMutation({
  args: { callId: v.string(), canal: v.optional(v.string()) },
  handler: async (ctx, { callId, canal }) => {
    const existe = await ctx.db
      .query("conversations")
      .withIndex("by_vapi", (q) => q.eq("vapiCallId", callId))
      .first();
    if (existe) return existe._id;
    return await ctx.db.insert("conversations", {
      inicio: Date.now(),
      canal: (canal === "navegador" || canal === "esp32" ? canal : "vapi") as any,
      vapiCallId: callId,
    });
  },
});

export const mensaje = internalMutation({
  args: { callId: v.string(), rol: v.string(), texto: v.string() },
  handler: async (ctx, { callId, rol, texto }) => {
    if (!texto.trim()) return null;
    const conv = await ctx.db
      .query("conversations")
      .withIndex("by_vapi", (q) => q.eq("vapiCallId", callId))
      .first();
    const conversationId = conv?._id ?? (await ctx.db.insert("conversations", { inicio: Date.now(), canal: "vapi", vapiCallId: callId }));
    const inicio = conv?.inicio ?? Date.now();
    return await ctx.db.insert("messages", {
      conversationId,
      rol: rol === "assistant" ? "assistant" : "user",
      texto: texto.trim(),
      t: (Date.now() - inicio) / 1000,
    });
  },
});

// Al terminar: cierra y programa el analizador (learning loop).
export const cerrar = internalMutation({
  args: { callId: v.string(), transcript: v.optional(v.string()), resumenVapi: v.optional(v.string()) },
  handler: async (ctx, { callId, transcript, resumenVapi }) => {
    const conv = await ctx.db
      .query("conversations")
      .withIndex("by_vapi", (q) => q.eq("vapiCallId", callId))
      .first();
    if (!conv) return null;
    if (conv.fin) return conv._id; // ya cerrada (status-update y end-of-call-report llegan los dos)
    await ctx.db.patch(conv._id, { fin: Date.now(), resumen: resumenVapi || conv.resumen });
    await ctx.scheduler.runAfter(0, internal.analizar.correr, { conversationId: conv._id, transcript: transcript || "" });
    return conv._id;
  },
});

// ---------------- panel ----------------
export const recientes = query({
  args: { n: v.optional(v.number()) },
  handler: async (ctx, { n }) => {
    const convs = await ctx.db.query("conversations").order("desc").take(n ?? 10);
    const out = [];
    for (const c of convs) {
      const cliente = c.customerId ? await ctx.db.get(c.customerId) : null;
      out.push({ ...c, cliente: cliente ? `${cliente.nombre}${cliente.empresa ? ` · ${cliente.empresa}` : ""}` : null });
    }
    return out;
  },
});

export const mensajes = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const ms = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .collect();
    return ms.sort((a, b) => a.t - b.t);
  },
});

export const activa = query({
  args: {},
  handler: async (ctx) => {
    const c = await ctx.db.query("conversations").order("desc").first();
    if (!c || c.fin) return null;
    const cliente = c.customerId ? await ctx.db.get(c.customerId) : null;
    const ms = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", c._id))
      .collect();
    return { ...c, cliente, mensajes: ms.sort((a, b) => a.t - b.t).slice(-12) };
  },
});
