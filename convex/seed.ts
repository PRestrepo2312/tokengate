import { mutation } from "./_generated/server";
import { normalizar } from "./util";

// npx convex run seed:todo  → catálogo (el robot se vende a sí mismo) + el cliente Juan de Acme con memoria (specs/04).
// Idempotente: no duplica.

const PRODUCTOS = [
  {
    nombre: "Starter",
    descripcion: "un vendedor con memoria para un stand o una recepción.",
    precio: 99,
    moneda: "USD",
    periodo: "mes",
    caracteristicas: ["un robot", "memoria de hasta 100 clientes", "catálogo y precios", "resumen por correo"],
    integraciones: [] as string[],
  },
  {
    nombre: "Pro",
    descripcion: "para equipos comerciales: varios robots y memoria compartida.",
    precio: 399,
    moneda: "USD",
    periodo: "mes",
    caracteristicas: ["hasta 5 robots", "memoria ilimitada", "agenda de demos", "insights de objeciones"],
    integraciones: ["HubSpot", "Google Calendar"],
  },
  {
    nombre: "Enterprise",
    descripcion: "para empresas: integraciones, SSO y soporte 24/7.",
    precio: 999,
    moneda: "USD",
    periodo: "mes",
    caracteristicas: ["robots ilimitados", "SSO", "soporte 24/7", "modelo dedicado"],
    integraciones: ["Salesforce", "HubSpot", "Microsoft Dynamics", "Slack"],
  },
];

export const todo = mutation({
  args: {},
  handler: async (ctx) => {
    let insertados = 0;
    for (const p of PRODUCTOS) {
      const norm = normalizar(p.nombre);
      const existe = await ctx.db
        .query("products")
        .withIndex("by_nombre", (q) => q.eq("nombreNorm", norm))
        .first();
      if (!existe) {
        await ctx.db.insert("products", { ...p, nombreNorm: norm });
        insertados++;
      }
    }
    // Juan de Acme: memoria precargada para que el primer intercambio del pitch ya tenga historia.
    const juanNorm = normalizar("Juan");
    let juan = await ctx.db
      .query("customers")
      .withIndex("by_nombre", (q) => q.eq("nombreNorm", juanNorm))
      .first();
    if (!juan) {
      const id = await ctx.db.insert("customers", {
        nombre: "Juan",
        nombreNorm: juanNorm,
        empresa: "Acme",
        rol: "CTO",
        etapa: "evaluacion",
        ultimaVez: Date.now() - 3 * 86400000,
      });
      await ctx.db.insert("customerMemory", {
        customerId: id,
        intereses: ["automatización", "inteligencia artificial"],
        objeciones: ["precio"],
        integraciones: ["Salesforce"],
        resumen: "La última vez hablamos de automatizar la atención en su stand y te preocupaba el precio del plan Enterprise.",
        siguienteAccion: "mostrar el retorno antes de hablar de precio",
        actualizado: Date.now() - 3 * 86400000,
      });
      const conv = await ctx.db.insert("conversations", {
        customerId: id,
        inicio: Date.now() - 3 * 86400000,
        fin: Date.now() - 3 * 86400000 + 240000,
        canal: "vapi",
        resultado: "seguimiento",
        resumen: "preguntó por automatización e integración con Salesforce; objeción de precio",
      });
      await ctx.db.insert("messages", { conversationId: conv, rol: "user", texto: "Hola, soy Juan, de Acme. Quiero automatizar la atención en nuestro stand.", t: 2 });
      await ctx.db.insert("messages", { conversationId: conv, rol: "assistant", texto: "Perfecto, Juan. ¿Cuántas personas pasan por el stand en un día?", t: 6 });
      await ctx.db.insert("messages", { conversationId: conv, rol: "user", texto: "Unas doscientas. ¿Se integra con Salesforce? ¿Y cuánto cuesta el Enterprise?", t: 14 });
      await ctx.db.insert("messages", { conversationId: conv, rol: "assistant", texto: "Sí, Enterprise se integra con Salesforce y cuesta 999 dólares al mes.", t: 20 });
      await ctx.db.insert("messages", { conversationId: conv, rol: "user", texto: "Uy, es caro. Déjame pensarlo.", t: 26 });
      juan = await ctx.db.get(id);
    }
    return { productosInsertados: insertados, juan: juan?._id };
  },
});
