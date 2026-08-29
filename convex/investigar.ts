import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { claudeJson } from "./claude";

// Tool `investigar`: el coach busca un dato específico (mercado, competidor, cifra, empresa) o verifica una afirmación del
// pitch. Con TAVILY_API_KEY usa Tavily (partner); sin key, responde Claude (Bedrock) con lo que sabe, avisando que puede
// estar desactualizado. Devuelve una cadena corta en español para decirse en voz alta.

export const buscar = internalAction({
  args: { tema: v.string(), para: v.optional(v.string()) },
  handler: async (_ctx, { tema, para }) => {
    const key = process.env.TAVILY_API_KEY;
    const pregunta = para ? `${tema} (contexto: ${para})` : tema;

    if (key) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      try {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          signal: ctrl.signal,
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({ query: pregunta, search_depth: "basic", max_results: 4, include_answer: "advanced" }),
        });
        if (res.ok) {
          const data: any = await res.json();
          const fuentes: string[] = (data.results ?? []).slice(0, 2).map((r: any) => String(r.title || "").slice(0, 60)).filter(Boolean);
          const respuesta = String(data.answer || "").trim();
          if (respuesta) {
            // Resumir en voz: máximo ~3 frases.
            const frases = respuesta.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ");
            return `${frases}${fuentes.length ? ` Fuente: ${fuentes.join(" y ")}.` : ""}`;
          }
        }
      } catch (e) {
        console.error("tavily falló:", String(e));
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      const r = await claudeJson({
        system: `Eres el asistente de investigación de un coach de pitch. Responde en español, en 2-3 frases, lo que sabes sobre la
pregunta: cifras, competidores, tamaño de mercado, contexto. Si no estás seguro o el dato puede haber cambiado, dilo en una frase
corta ("dato aproximado, verifícalo"). Nunca inventes cifras precisas que no conozcas. Responde solo el JSON.`,
        usuario: pregunta,
        schema: { type: "object", properties: { respuesta: { type: "string" } }, required: ["respuesta"], additionalProperties: false },
        maxTokens: 300,
        timeoutMs: 15000,
      });
      return `${String(r.respuesta || "").trim()} (Sin acceso a internet ahora; es lo que sé hasta mi última actualización.)`;
    } catch (e) {
      console.error("investigar falló:", String(e));
      return "No pude investigar eso ahora mismo. Sigamos con el pitch.";
    }
  },
});
