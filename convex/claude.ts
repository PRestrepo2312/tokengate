// Claude por Amazon Bedrock (cuenta AWS de Andrey), igual que en LUMI: SigV4 con aws4fetch desde el runtime por defecto.
// Variables en Convex: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, TG_MODELO (por defecto Sonnet 4.6).
// Gotcha: la salida estructurada NO admite minimum/maximum/minItems ni tipos null en el esquema.

import { AwsClient } from "aws4fetch";

export function modelo(): string {
  return process.env.TG_MODELO || "us.anthropic.claude-sonnet-4-6";
}

export async function claudeJson(opts: {
  system: string;
  usuario: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
  modelo?: string;
}): Promise<any> {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || "us-east-1";
  if (!accessKeyId || !secretAccessKey) throw new Error("Faltan AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY en Convex");
  const m = opts.modelo || modelo();
  const aws = new AwsClient({ accessKeyId, secretAccessKey, region, service: "bedrock" });
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(m)}/invoke`;

  const outputConfig: Record<string, unknown> = { format: { type: "json_schema", schema: opts.schema } };
  if (/opus|sonnet-5/.test(m)) outputConfig.effort = "low";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const res = await aws.fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: opts.maxTokens,
        system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: opts.usuario }],
        output_config: outputConfig,
      }),
    });
    if (!res.ok) throw new Error(`Bedrock ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data: any = await res.json();
    if (data.stop_reason === "refusal") throw new Error("Claude: refusal");
    const bloque = (data.content as any[]).find((b) => b.type === "text");
    if (!bloque) throw new Error("Claude: sin bloque de texto");
    return JSON.parse(bloque.text);
  } finally {
    clearTimeout(timer);
  }
}
