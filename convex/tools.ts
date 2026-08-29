import { v } from "convex/values";
import { internalMutation, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { buscarCliente, buscarProducto, etapaLegible, lista, normalizar, precioLegible, unir } from "./util";

// Las 7 tools del vendedor (specs/01 §2). Cada una devuelve UNA cadena corta en español, pensada para decirse en voz alta.
// El modelo de voz (Vapi) nunca ve JSON: ve estas frases.

type Ctx = MutationCtx;
type Args = Record<string, any>;

const ETAPAS = ["nuevo", "descubrimiento", "evaluacion", "propuesta", "cerrado"] as const;
const INTENCIONES = ["baja", "media", "alta"] as const;

function str(x: unknown): string {
  return typeof x === "string" ? x.trim() : x == null ? "" : String(x);
}
function arr(x: unknown): string[] {
  if (Array.isArray(x)) return x.map(str).filter(Boolean);
  if (typeof x === "string" && x.trim()) return x.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

async function conversacionActiva(ctx: Ctx, callId?: string) {
  if (!callId) return null;
  return await ctx.db
    .query("conversations")
    .withIndex("by_vapi", (q) => q.eq("vapiCallId", callId))
    .first();
}

async function memoriaDe(ctx: Ctx, customerId: Id<"customers">) {
  return await ctx.db
    .query("customerMemory")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .first();
}

async function clienteOCrear(ctx: Ctx, nombre: string, empresa?: string, rol?: string) {
  let c = await buscarCliente(ctx, nombre);
  let nuevo = false;
  if (!c) {
    const id = await ctx.db.insert("customers", {
      nombre: nombre.trim(),
      nombreNorm: normalizar(nombre),
      empresa: empresa || undefined,
      rol: rol || undefined,
      etapa: "nuevo",
      ultimaVez: Date.now(),
    });
    c = (await ctx.db.get(id))!;
    nuevo = true;
  } else {
    const cambios: Record<string, unknown> = { ultimaVez: Date.now() };
    if (empresa && !c.empresa) cambios.empresa = empresa;
    if (rol && !c.rol) cambios.rol = rol;
    await ctx.db.patch(c._id, cambios);
  }
  return { c, nuevo };
}

// ---------------- tools ----------------

async function get_customer_context(ctx: Ctx, a: Args, callId?: string): Promise<string> {
  const nombre = str(a.nombre);
  if (!nombre) return "¿Me recuerdas tu nombre?";
  const { c, nuevo } = await clienteOCrear(ctx, nombre, str(a.empresa), str(a.rol));
  const conv = await conversacionActiva(ctx, callId);
  if (conv && conv.customerId !== c._id) await ctx.db.patch(conv._id, { customerId: c._id });

  const quien = `${c.nombre}${c.empresa ? `, de ${c.empresa}` : ""}${c.rol ? ` (${c.rol})` : ""}`;
  if (nuevo) return `Cliente nuevo: ${quien}. Registrado. No hay historial: descubre qué necesita.`;

  const m = await memoriaDe(ctx, c._id);
  const partes = [`${quien}. Etapa: ${etapaLegible(c.etapa)}.`];
  if (m?.resumen) partes.push(m.resumen);
  if (m?.intereses.length) partes.push(`Intereses: ${lista(m.intereses)}.`);
  if (m?.objeciones.length) partes.push(`Objeciones: ${lista(m.objeciones)}.`);
  if (m?.integraciones.length) partes.push(`Integraciones que preguntó: ${lista(m.integraciones)}.`);
  if (m?.siguienteAccion) partes.push(`Siguiente paso pendiente: ${m.siguienteAccion}.`);
  if (c.ultimaVez) {
    const dias = Math.round((Date.now() - c.ultimaVez) / 86400000);
    partes.push(dias <= 0 ? "Hablamos hoy mismo." : `Última conversación hace ${dias} día${dias === 1 ? "" : "s"}.`);
  }
  return partes.join(" ");
}

async function get_product_info(ctx: Ctx, a: Args): Promise<string> {
  const nombre = str(a.producto);
  if (nombre) {
    const p = await buscarProducto(ctx, nombre);
    if (!p) return `No tengo un producto llamado ${nombre}. Tenemos: ${lista((await ctx.db.query("products").collect()).map((x) => x.nombre))}.`;
    const extra = p.integraciones.length ? ` Integraciones: ${lista(p.integraciones)}.` : "";
    return `${p.nombre}: ${p.descripcion} Incluye ${lista(p.caracteristicas)}.${extra}`;
  }
  const todos = await ctx.db.query("products").collect();
  if (!todos.length) return "Todavía no tengo catálogo cargado.";
  return `Tenemos ${todos.length} planes: ${todos.map((p) => `${p.nombre}, ${p.descripcion}`).join("; ")}.`;
}

async function get_pricing(ctx: Ctx, a: Args): Promise<string> {
  const nombre = str(a.producto);
  if (!nombre) {
    const todos = await ctx.db.query("products").collect();
    return `Precios: ${todos.map((p) => `${p.nombre} ${precioLegible(p)}`).join("; ")}.`;
  }
  const p = await buscarProducto(ctx, nombre);
  if (!p) return `No tengo precio para ${nombre}. Pregúntame por ${lista((await ctx.db.query("products").collect()).map((x) => x.nombre))}.`;
  return `${p.nombre} cuesta ${precioLegible(p)}.`;
}

async function get_previous_conversations(ctx: Ctx, a: Args): Promise<string> {
  const c = await buscarCliente(ctx, str(a.nombre));
  if (!c) return "No tengo conversaciones anteriores con ese nombre.";
  const convs = (
    await ctx.db
      .query("conversations")
      .withIndex("by_customer", (q) => q.eq("customerId", c._id))
      .collect()
  )
    .filter((x) => x.fin)
    .sort((x, y) => y.inicio - x.inicio)
    .slice(0, 3);
  if (!convs.length) return `Es la primera conversación con ${c.nombre}.`;
  const fecha = (ms: number) => new Date(ms).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  return `${convs.length} conversación${convs.length === 1 ? "" : "es"}: ${convs
    .map((x) => `${fecha(x.inicio)}, ${x.resumen || "sin resumen"}${x.resultado ? ` (${x.resultado.replace("_", " ")})` : ""}`)
    .join("; ")}.`;
}

async function save_customer_memory(ctx: Ctx, a: Args): Promise<string> {
  const nombre = str(a.nombre);
  if (!nombre) return "¿Me recuerdas tu nombre?";
  const { c } = await clienteOCrear(ctx, nombre, str(a.empresa));
  const m = await memoriaDe(ctx, c._id);
  const etapa = str(a.etapa).toLowerCase();
  const datos = {
    customerId: c._id,
    intereses: unir(m?.intereses ?? [], arr(a.intereses)),
    objeciones: unir(m?.objeciones ?? [], arr(a.objeciones)),
    integraciones: unir(m?.integraciones ?? [], arr(a.integraciones)),
    resumen: str(a.nota) || m?.resumen || "",
    siguienteAccion: str(a.siguienteAccion) || m?.siguienteAccion,
    actualizado: Date.now(),
  };
  if (m) await ctx.db.patch(m._id, datos);
  else await ctx.db.insert("customerMemory", datos);
  if ((ETAPAS as readonly string[]).includes(etapa)) await ctx.db.patch(c._id, { etapa: etapa as any });
  return "Anotado.";
}

async function create_lead(ctx: Ctx, a: Args): Promise<string> {
  const nombre = str(a.nombre);
  if (!nombre) return "¿Me recuerdas tu nombre?";
  const { c } = await clienteOCrear(ctx, nombre, str(a.empresa));
  const intencion = (INTENCIONES as readonly string[]).includes(str(a.intencion).toLowerCase()) ? (str(a.intencion).toLowerCase() as any) : "media";
  await ctx.db.insert("leads", { customerId: c._id, producto: str(a.producto) || undefined, intencion, nota: str(a.nota) || undefined, creado: Date.now() });
  if (c.etapa === "nuevo") await ctx.db.patch(c._id, { etapa: "descubrimiento" });
  return `Lead creado${a.producto ? ` para ${str(a.producto)}` : ""} con intención ${intencion}.`;
}

async function schedule_demo(ctx: Ctx, a: Args, callId?: string): Promise<string> {
  const nombre = str(a.nombre);
  if (!nombre) return "¿Me recuerdas tu nombre?";
  const cuando = str(a.cuando) || "por confirmar";
  const { c } = await clienteOCrear(ctx, nombre, str(a.empresa));
  await ctx.db.insert("demos", { customerId: c._id, cuando, nota: str(a.nota) || undefined, creado: Date.now() });
  if (c.etapa === "nuevo" || c.etapa === "descubrimiento") await ctx.db.patch(c._id, { etapa: "evaluacion" });
  const conv = await conversacionActiva(ctx, callId);
  if (conv) await ctx.db.patch(conv._id, { resultado: "demo_agendada" });
  return `Demo agendada para ${cuando}. Te la confirmo por correo.`;
}

export const TOOLS: Record<string, (ctx: Ctx, a: Args, callId?: string) => Promise<string>> = {
  get_customer_context,
  get_product_info,
  get_pricing,
  get_previous_conversations,
  save_customer_memory,
  create_lead,
  schedule_demo,
};

// Punto de entrada único desde el webhook (http.ts). Registra la llamada en `messages`.
export const ejecutar = internalMutation({
  args: { name: v.string(), args: v.any(), callId: v.optional(v.string()) },
  handler: async (ctx, { name, args, callId }) => {
    const fn = TOOLS[name];
    if (!fn) return `No conozco la herramienta ${name}.`;
    let resultado: string;
    try {
      resultado = await fn(ctx, (args ?? {}) as Args, callId);
    } catch (e) {
      console.error(`tool ${name} falló:`, String(e));
      resultado = "No pude consultar eso ahora mismo. Sigamos.";
    }
    const conv = await conversacionActiva(ctx, callId);
    if (conv) {
      await ctx.db.insert("messages", {
        conversationId: conv._id,
        rol: "tool",
        texto: resultado,
        t: (Date.now() - conv.inicio) / 1000,
        tool: name,
        args: JSON.stringify(args ?? {}),
        resultado,
      });
    }
    return resultado;
  },
});
