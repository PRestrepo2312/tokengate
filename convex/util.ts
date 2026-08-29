import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

export function normalizar(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ETAPAS: Record<string, string> = {
  nuevo: "nuevo",
  descubrimiento: "descubrimiento",
  evaluacion: "evaluación",
  propuesta: "propuesta",
  cerrado: "cerrado",
};

export function etapaLegible(e: string): string {
  return ETAPAS[e] ?? e;
}

// Busca un cliente por nombre: exacto por nombre normalizado, luego por primer nombre ("Juan" ↔ "Juan Pérez").
export async function buscarCliente(ctx: QueryCtx | MutationCtx, nombre: string): Promise<Doc<"customers"> | null> {
  const norm = normalizar(nombre);
  if (!norm) return null;
  const exacto = await ctx.db
    .query("customers")
    .withIndex("by_nombre", (q) => q.eq("nombreNorm", norm))
    .first();
  if (exacto) return exacto;
  const primero = norm.split(" ")[0];
  const todos = await ctx.db.query("customers").collect();
  const cand = todos.filter((c) => c.nombreNorm.split(" ")[0] === primero);
  return cand.length === 1 ? cand[0] : null;
}

export async function buscarProducto(ctx: QueryCtx | MutationCtx, nombre: string): Promise<Doc<"products"> | null> {
  const norm = normalizar(nombre);
  if (!norm) return null;
  const exacto = await ctx.db
    .query("products")
    .withIndex("by_nombre", (q) => q.eq("nombreNorm", norm))
    .first();
  if (exacto) return exacto;
  const todos = await ctx.db.query("products").collect();
  return todos.find((p) => p.nombreNorm.includes(norm) || norm.includes(p.nombreNorm)) ?? null;
}

export function precioLegible(p: Doc<"products">): string {
  const monto = p.moneda === "USD" ? `${p.precio} dólares` : `${p.precio} ${p.moneda}`;
  return p.periodo === "único" ? `${monto}, pago único` : `${monto} al ${p.periodo}`;
}

export function lista(xs: string[]): string {
  const u = Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));
  if (u.length === 0) return "";
  if (u.length === 1) return u[0];
  return `${u.slice(0, -1).join(", ")} y ${u[u.length - 1]}`;
}

export function unir(a: string[], b: string[] | undefined): string[] {
  const s = new Set(a.map((x) => x.trim().toLowerCase()).filter(Boolean));
  for (const x of b ?? []) s.add(x.trim().toLowerCase());
  return Array.from(s).filter(Boolean);
}
