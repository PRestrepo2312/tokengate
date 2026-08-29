import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { buscarCliente, lista, normalizar, unir } from "./util";

// Tools del COACH de pitch (no vendedor). Cada una devuelve UNA cadena corta en español para decirse en voz alta.
//   recordar_usuario     → quién es, qué vende, a quién, pitches anteriores, fortalezas/debilidades, último feedback
//   guardar_memoria      → producto, audiencia, problema, diferencial, objetivo, fortalezas, debilidades, feedback, progreso
//   guardar_pitch        → una versión del pitch (texto) con feedback y puntaje
//   pitches_anteriores   → las últimas versiones, para comparar
// (se conservan los nombres viejos como alias para llamadas antiguas)

type Ctx = MutationCtx;
type Args = Record<string, any>;

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

async function personaOCrear(ctx: Ctx, nombre: string, empresa?: string, rol?: string) {
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

async function recordar_usuario(ctx: Ctx, a: Args, callId?: string): Promise<string> {
  const nombre = str(a.nombre);
  if (!nombre) return "¿Me recuerdas tu nombre?";
  const { c, nuevo } = await personaOCrear(ctx, nombre, str(a.empresa), str(a.rol));
  const conv = await conversacionActiva(ctx, callId);
  if (conv && conv.customerId !== c._id) await ctx.db.patch(conv._id, { customerId: c._id });

  const quien = `${c.nombre}${c.empresa ? `, de ${c.empresa}` : ""}`;
  if (nuevo) return `Persona nueva: ${quien}. Es su primera sesión: no hay pitch anterior. Pregunta qué vende, a quién y qué quiere lograr.`;

  const m = await memoriaDe(ctx, c._id);
  const pitches = await ctx.db
    .query("pitches")
    .withIndex("by_customer", (q) => q.eq("customerId", c._id))
    .collect();
  const ultimo = pitches.sort((x, y) => y.creado - x.creado)[0];
  const partes = [`${quien}. Sesión número ${(m?.sesiones ?? pitches.length) + 1}.`];
  if (m?.resumen) partes.push(m.resumen);
  if (m?.producto) partes.push(`Vende: ${m.producto}${m.audiencia ? ` a ${m.audiencia}` : ""}.`);
  if (m?.problema) partes.push(`Problema que resuelve: ${m.problema}.`);
  if (m?.objetivo) partes.push(`Objetivo del pitch: ${m.objetivo}.`);
  if (m?.fortalezas?.length) partes.push(`Fortalezas: ${lista(m.fortalezas)}.`);
  if (m?.debilidades?.length) partes.push(`A mejorar: ${lista(m.debilidades)}.`);
  if (m?.feedback?.length) partes.push(`Último feedback: ${m.feedback[m.feedback.length - 1]}.`);
  if (m?.progreso) partes.push(`Progreso: ${m.progreso}.`);
  if (ultimo) partes.push(`Último pitch (versión ${ultimo.version}${ultimo.puntaje != null ? `, ${ultimo.puntaje} sobre 10` : ""}): "${ultimo.texto.slice(0, 220)}".`);
  if (c.ultimaVez) {
    const dias = Math.round((Date.now() - c.ultimaVez) / 86400000);
    partes.push(dias <= 0 ? "Hablamos hoy mismo." : `Última sesión hace ${dias} día${dias === 1 ? "" : "s"}.`);
  }
  return partes.join(" ");
}

async function guardar_memoria(ctx: Ctx, a: Args): Promise<string> {
  const nombre = str(a.nombre);
  if (!nombre) return "¿Me recuerdas tu nombre?";
  const { c } = await personaOCrear(ctx, nombre, str(a.empresa));
  const m = await memoriaDe(ctx, c._id);
  const datos = {
    customerId: c._id,
    intereses: m?.intereses ?? [],
    objeciones: unir(m?.objeciones ?? [], arr(a.objeciones)),
    integraciones: m?.integraciones ?? [],
    resumen: str(a.resumen) || m?.resumen || "",
    siguienteAccion: str(a.siguienteAccion) || m?.siguienteAccion,
    actualizado: Date.now(),
    producto: str(a.producto) || m?.producto,
    audiencia: str(a.audiencia) || m?.audiencia,
    problema: str(a.problema) || m?.problema,
    diferencial: str(a.diferencial) || m?.diferencial,
    fortalezas: unir(m?.fortalezas ?? [], arr(a.fortalezas)),
    debilidades: unir(m?.debilidades ?? [], arr(a.debilidades)),
    feedback: [...(m?.feedback ?? []), ...arr(a.feedback)].slice(-8),
    objetivo: str(a.objetivo) || m?.objetivo,
    progreso: str(a.progreso) || m?.progreso,
    sesiones: m?.sesiones ?? 0,
  };
  if (m) await ctx.db.patch(m._id, datos);
  else await ctx.db.insert("customerMemory", datos);
  return "Anotado.";
}

async function guardar_pitch(ctx: Ctx, a: Args): Promise<string> {
  const nombre = str(a.nombre);
  const texto = str(a.texto);
  if (!nombre) return "¿Me recuerdas tu nombre?";
  if (!texto) return "No tengo el texto del pitch.";
  const { c } = await personaOCrear(ctx, nombre, str(a.empresa));
  const previos = await ctx.db.query("pitches").withIndex("by_customer", (q) => q.eq("customerId", c._id)).collect();
  const version = previos.length + 1;
  const puntaje = Number(a.puntaje);
  await ctx.db.insert("pitches", {
    customerId: c._id,
    texto,
    version,
    feedback: str(a.feedback) || undefined,
    puntaje: Number.isFinite(puntaje) ? Math.max(0, Math.min(10, Math.round(puntaje))) : undefined,
    creado: Date.now(),
  });
  return `Guardada la versión ${version} del pitch.`;
}

async function pitches_anteriores(ctx: Ctx, a: Args): Promise<string> {
  const c = await buscarCliente(ctx, str(a.nombre));
  if (!c) return "No tengo pitches con ese nombre.";
  const ps = (await ctx.db.query("pitches").withIndex("by_customer", (q) => q.eq("customerId", c._id)).collect())
    .sort((x, y) => y.version - x.version)
    .slice(0, 3);
  if (!ps.length) return `${c.nombre} todavía no tiene pitches guardados.`;
  return ps.map((p) => `Versión ${p.version}${p.puntaje != null ? ` (${p.puntaje}/10)` : ""}: "${p.texto.slice(0, 160)}"${p.feedback ? ` — feedback: ${p.feedback.slice(0, 120)}` : ""}`).join(" | ");
}

export const TOOLS: Record<string, (ctx: Ctx, a: Args, callId?: string) => Promise<string>> = {
  recordar_usuario,
  guardar_memoria,
  guardar_pitch,
  pitches_anteriores,
  // alias de la versión "vendedor" (por si quedan tools viejas enlazadas)
  get_customer_context: recordar_usuario,
  save_customer_memory: guardar_memoria,
  get_previous_conversations: pitches_anteriores,
};

// Registro de una tool ejecutada fuera de este módulo (p. ej. `investigar`, que es una action).
export const registrar = internalMutation({
  args: { name: v.string(), args: v.any(), callId: v.optional(v.string()), resultado: v.string() },
  handler: async (ctx, { name, args, callId, resultado }) => {
    const conv = await conversacionActiva(ctx, callId);
    if (!conv) return;
    await ctx.db.insert("messages", {
      conversationId: conv._id,
      rol: "tool",
      texto: resultado,
      t: (Date.now() - conv.inicio) / 1000,
      tool: name,
      args: JSON.stringify(args ?? {}),
      resultado,
    });
  },
});

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
