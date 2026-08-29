import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Webhook de Vapi: https://<deployment>.convex.site/vapi
// Recibe tool-calls (responde con los resultados), transcript (guarda finales), status-update y end-of-call-report (cierra y
// dispara el analizador). Todo lo demás: 200 vacío. Formatos: docs.vapi.ai/tools/custom-tools y /server-url/events.

const http = httpRouter();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

http.route({
  path: "/vapi",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "json inválido" }, 400);
    }
    const m = body?.message ?? {};
    const callId: string = String(m?.call?.id ?? body?.call?.id ?? "sin-id");

    switch (m.type) {
      case "tool-calls": {
        await ctx.runMutation(internal.conversations.asegurar, { callId });
        const lista: any[] = Array.isArray(m.toolCallList) ? m.toolCallList : [];
        const results = [];
        for (const tc of lista) {
          const name = String(tc?.name ?? tc?.function?.name ?? "");
          let args = tc?.arguments ?? tc?.function?.arguments ?? {};
          if (typeof args === "string") {
            try {
              args = JSON.parse(args);
            } catch {
              args = {};
            }
          }
          let result: string;
          if (name === "investigar") {
            // Necesita red (Tavily / Claude): corre como action y se registra aparte.
            result = await ctx.runAction(internal.investigar.buscar, {
              tema: String(args?.tema ?? args?.pregunta ?? ""),
              tipo: args?.tipo ? String(args.tipo) : undefined,
              para: args?.para ? String(args.para) : undefined,
            });
            await ctx.runMutation(internal.tools.registrar, { name, args, callId, resultado: result });
          } else if (name === "generar_pitch") {
            const s = (k: string) => (args?.[k] != null && String(args[k]).trim() ? String(args[k]).trim() : undefined);
            result = await ctx.runAction(internal.generar.pitch, {
              nombre: s("nombre") ?? "",
              empresa: s("empresa"),
              producto: s("producto") ?? "",
              audiencia: s("audiencia"),
              problema: s("problema"),
              diferencial: s("diferencial"),
              objetivo: s("objetivo"),
              estilo: s("estilo"),
              contexto: s("contexto"),
            });
            await ctx.runMutation(internal.tools.registrar, { name, args, callId, resultado: result });
          } else {
            result = await ctx.runMutation(internal.tools.ejecutar, { name, args, callId });
          }
          results.push({ toolCallId: tc?.id, result });
        }
        return json({ results });
      }
      case "status-update": {
        if (m.status === "in-progress") await ctx.runMutation(internal.conversations.asegurar, { callId });
        if (m.status === "ended") await ctx.runMutation(internal.conversations.cerrar, { callId });
        return json({});
      }
      case "transcript": {
        if (m.transcriptType === "final" && m.transcript) {
          await ctx.runMutation(internal.conversations.mensaje, { callId, rol: String(m.role ?? "user"), texto: String(m.transcript) });
        }
        return json({});
      }
      case "end-of-call-report": {
        const transcript = String(m?.artifact?.transcript ?? m?.transcript ?? "");
        const resumen = m?.analysis?.summary ? String(m.analysis.summary) : undefined;
        await ctx.runMutation(internal.conversations.cerrar, { callId, transcript, resumenVapi: resumen });
        return json({});
      }
      default:
        return json({});
    }
  }),
});

// Salud: GET /salud → 200 con el nombre del proyecto.
http.route({
  path: "/salud",
  method: "GET",
  handler: httpAction(async () => json({ ok: true, proyecto: "tokengate" })),
});

export default http;
