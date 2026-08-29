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
          const result = await ctx.runMutation(internal.tools.ejecutar, { name, args, callId });
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
