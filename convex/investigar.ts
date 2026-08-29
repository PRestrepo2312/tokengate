import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { claudeJson } from "./claude";

// Tool `investigar`: datos específicos (mercado, competidor, cifra, empresa) o CASOS REALES (ejemplos de éxito, pitches
// famosos, empresas parecidas). Con TAVILY_API_KEY busca en internet y Claude resume con fuentes; sin key, Claude responde
// con lo que sabe avisando que puede estar desactualizado. Siempre 2-4 frases en español para decirse en voz alta.

const SYSTEM_RESUMEN = `Eres el investigador de un coach de pitch. Recibes resultados de búsqueda (título, url, extracto) y una
pregunta. Responde en español, 2-4 frases, con el dato o los ejemplos más útiles para un pitch: cifras con su año, nombres
concretos, y qué hicieron bien los casos reales. Cita 1-2 fuentes por nombre (no la URL). Si los resultados no responden la
pregunta, dilo. No inventes. Responde solo el JSON.`;

const SYSTEM_MEMORIA = `Eres el investigador de un coach de pitch, sin acceso a internet. Responde en español, 2-4 frases, con lo
que sabes: cifras aproximadas con su año, competidores o ejemplos reales conocidos, y qué hicieron bien. Si un dato puede haber
cambiado, dilo en pocas palabras ("dato de 2024, verifícalo"). Nunca inventes cifras precisas. Responde solo el JSON.`;

const SCHEMA = { type: "object", properties: { respuesta: { type: "string" } }, required: ["respuesta"], additionalProperties: false };

function armarConsulta(tema: string, tipo: string, para?: string): string {
  const t = tema.trim();
  if (tipo === "casos") return `casos de éxito ejemplos reales ${t} ${para ?? ""} pitch estrategia resultados`.trim();
  const conPais = /colombia|latam|latinoam|méxico|mexico|españa|chile|perú|peru|argentina/i.test(t) ? t : `${t} Colombia`;
  return `${conPais} cifras 2025 2026`;
}

export const buscar = internalAction({
  args: { tema: v.string(), tipo: v.optional(v.string()), para: v.optional(v.string()) },
  handler: async (_ctx, { tema, tipo, para }) => {
    const key = process.env.TAVILY_API_KEY;
    const t = (tipo || "dato").toLowerCase();
    const consulta = armarConsulta(tema, t, para);

    if (key) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          signal: ctrl.signal,
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({ query: consulta, search_depth: "advanced", max_results: 6, include_answer: "advanced" }),
        });
        if (res.ok) {
          const data: any = await res.json();
          const resultados = (data.results ?? []).slice(0, 6).map((r: any) => ({
            titulo: String(r.title || "").slice(0, 90),
            url: String(r.url || ""),
            extracto: String(r.content || "").replace(/\s+/g, " ").slice(0, 400),
          }));
          const r = await claudeJson({
            system: SYSTEM_RESUMEN,
            usuario: JSON.stringify({ pregunta: tema, tipo: t, para: para ?? "", respuesta_previa: data.answer ?? "", resultados }),
            schema: SCHEMA,
            maxTokens: 350,
            timeoutMs: 15000,
          });
          const texto = String(r.respuesta || "").trim();
          if (texto) return texto;
        } else {
          console.error("tavily", res.status, (await res.text()).slice(0, 200));
        }
      } catch (e) {
        console.error("tavily falló:", String(e));
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      const r = await claudeJson({
        system: SYSTEM_MEMORIA,
        usuario: JSON.stringify({ pregunta: tema, tipo: t, para: para ?? "" }),
        schema: SCHEMA,
        maxTokens: 350,
        timeoutMs: 15000,
      });
      return `${String(r.respuesta || "").trim()} (Esto es de memoria, sin internet: verifícalo.)`;
    } catch (e) {
      console.error("investigar falló:", String(e));
      return "No pude investigar eso ahora mismo. Sigamos con el pitch.";
    }
  },
});
