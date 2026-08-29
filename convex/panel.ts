import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Queries para la página (web/): clientes con memoria, insights globales y el estado del cuerpo.

export const clientes = query({
  args: {},
  handler: async (ctx) => {
    const cs = await ctx.db.query("customers").collect();
    const out = [];
    for (const c of cs) {
      const m = await ctx.db
        .query("customerMemory")
        .withIndex("by_customer", (q) => q.eq("customerId", c._id))
        .first();
      const leads = await ctx.db.query("leads").withIndex("by_customer", (q) => q.eq("customerId", c._id)).collect();
      const demos = await ctx.db.query("demos").withIndex("by_customer", (q) => q.eq("customerId", c._id)).collect();
      out.push({
        _id: c._id,
        nombre: c.nombre,
        empresa: c.empresa ?? null,
        rol: c.rol ?? null,
        etapa: c.etapa,
        ultimaVez: c.ultimaVez ?? null,
        intereses: m?.intereses ?? [],
        objeciones: m?.objeciones ?? [],
        integraciones: m?.integraciones ?? [],
        resumen: m?.resumen ?? "",
        siguienteAccion: m?.siguienteAccion ?? null,
        leads: leads.length,
        demos: demos.map((d) => d.cuando),
      });
    }
    return out.sort((a, b) => (b.ultimaVez ?? 0) - (a.ultimaVez ?? 0));
  },
});

export const insights = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("salesInsights").collect();
  },
});

export const productos = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("products").collect(),
});

// Cuerpo del robot (specs/03): lo escribe la página con los eventos de Vapi; lo lee robot/puente.py.
export const cuerpo = query({
  args: {},
  handler: async (ctx) => {
    const f = await ctx.db.query("cuerpo").order("desc").first();
    return f ?? { estado: "idle", t: 0 };
  },
});

export const setCuerpo = mutation({
  args: { estado: v.string() },
  handler: async (ctx, { estado }) => {
    const valido = ["idle", "escuchando", "pensando", "hablando", "anotando"].includes(estado) ? estado : "idle";
    const f = await ctx.db.query("cuerpo").order("desc").first();
    if (f) await ctx.db.patch(f._id, { estado: valido as any, t: Date.now() });
    else await ctx.db.insert("cuerpo", { estado: valido as any, t: Date.now() });
    return valido;
  },
});
