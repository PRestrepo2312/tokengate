import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

// Grafo de pensamiento del coach para una conversación: qué dijo la persona, qué respondió el coach, qué herramientas
// llamó (memoria, investigar, generar pitch, guardar) y qué quedó en la memoria (versiones del pitch). SVG a mano.

const COLOR_TOOL: Record<string, string> = {
  recordar_usuario: "#4f8cff",
  get_customer_context: "#4f8cff",
  guardar_memoria: "#9d7bff",
  save_customer_memory: "#9d7bff",
  guardar_pitch: "#4fd18b",
  pitches_anteriores: "#4fd18b",
  generar_pitch: "#ffb547",
  investigar: "#ff8c5c",
};
const ETIQUETA_TOOL: Record<string, string> = {
  recordar_usuario: "recordó a la persona",
  get_customer_context: "recordó a la persona",
  guardar_memoria: "guardó memoria",
  save_customer_memory: "guardó memoria",
  guardar_pitch: "guardó el pitch",
  pitches_anteriores: "comparó pitches",
  generar_pitch: "generó un pitch (Claude)",
  investigar: "investigó",
};

function corta(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export default function Grafo({ onCerrar }: { onCerrar: () => void }) {
  const recientes = useQuery(api.conversations.recientes, { n: 8 }) ?? [];
  const conv = recientes.find((c: any) => c.fin) ?? recientes[0];
  const mensajes = useQuery(api.conversations.mensajes, conv ? { conversationId: conv._id } : "skip") ?? [];
  const clientes = useQuery(api.panel.clientes) ?? [];
  const nombreConv: string = conv?.cliente ?? "";
  const cliente = nombreConv ? clientes.find((c: any) => nombreConv.startsWith(c.nombre)) : undefined;

  const W = 1600, H = 720;
  const izq = 120, der = W - 300;
  const maxT = Math.max(20, ...mensajes.map((m: any) => m.t)) * 1.05;
  const x = (t: number) => izq + (t / maxT) * (der - izq);
  const carril = { user: 150, assistant: 300, tool: 450 };

  const nodos = mensajes.map((m: any, i: number) => ({
    id: i,
    t: m.t,
    x: x(m.t),
    y: m.rol === "tool" ? carril.tool : m.rol === "user" ? carril.user : carril.assistant,
    rol: m.rol,
    tool: m.tool as string | undefined,
    texto: m.texto as string,
  }));

  // Aristas: cada tool → el último mensaje de la persona antes (qué la disparó) y el siguiente del coach (qué produjo).
  const aristas: { a: any; b: any; color: string }[] = [];
  nodos.forEach((n: any, i: number) => {
    if (n.rol !== "tool") return;
    const prev = [...nodos.slice(0, i)].reverse().find((p: any) => p.rol === "user");
    const next = nodos.slice(i + 1).find((p: any) => p.rol === "assistant");
    const color = COLOR_TOOL[n.tool ?? ""] ?? "#aab3c5";
    if (prev) aristas.push({ a: prev, b: n, color });
    if (next) aristas.push({ a: n, b: next, color });
  });

  return (
    <main className="grafo">
      <div className="grafo-cab">
        <h2>Cómo pensó el coach{conv?.cliente ? ` con ${conv.cliente}` : ""}</h2>
        <span className="teclas">G o Esc: volver</span>
        <button className="cerrar" onClick={onCerrar}>Volver</button>
      </div>
      {!conv && <div className="vacio">Todavía no hay conversaciones.</div>}
      {conv && (
        <div className="grafo-scroll">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafo de la conversación: persona, coach, herramientas y memoria">
            {/* carriles */}
            {[
              ["PERSONA", carril.user, "#4fd18b"],
              ["COACH", carril.assistant, "#4f8cff"],
              ["HERRAMIENTAS", carril.tool, "#9d7bff"],
            ].map(([nombre, y, col]) => (
              <g key={String(nombre)}>
                <line x1={izq - 20} y1={Number(y)} x2={der + 20} y2={Number(y)} stroke="#262c3a" strokeWidth={1} />
                <text x={20} y={Number(y) + 4} fill={String(col)} fontSize={13} fontFamily="Consolas, monospace" letterSpacing={2}>{String(nombre)}</text>
              </g>
            ))}
            {/* eje de tiempo */}
            {Array.from({ length: Math.floor(maxT / 15) + 1 }, (_, k) => k * 15).map((t) => (
              <g key={t}>
                <line x1={x(t)} y1={carril.user - 30} x2={x(t)} y2={carril.tool + 40} stroke="#1c2130" strokeWidth={1} />
                <text x={x(t)} y={carril.tool + 60} fill="#6f7a90" fontSize={12} textAnchor="middle" fontFamily="Consolas, monospace">{t}s</text>
              </g>
            ))}
            {/* aristas */}
            {aristas.map((e, i) => (
              <path key={i} d={`M ${e.a.x} ${e.a.y} C ${e.a.x} ${(e.a.y + e.b.y) / 2}, ${e.b.x} ${(e.a.y + e.b.y) / 2}, ${e.b.x} ${e.b.y}`} fill="none" stroke={e.color} strokeWidth={2} opacity={0.55} />
            ))}
            {/* nodos */}
            {nodos.map((n: any) => {
              const col = n.rol === "tool" ? COLOR_TOOL[n.tool ?? ""] ?? "#aab3c5" : n.rol === "user" ? "#4fd18b" : "#4f8cff";
              const arriba = n.id % 2 === 0;
              const etiqueta = n.rol === "tool" ? ETIQUETA_TOOL[n.tool ?? ""] ?? n.tool : corta(n.texto, 46);
              return (
                <g key={n.id}>
                  <circle cx={n.x} cy={n.y} r={n.rol === "tool" ? 11 : 7} fill={col} stroke="#0b0d12" strokeWidth={2} />
                  <text x={n.x} y={n.y + (arriba ? -18 : 28)} fill={n.rol === "tool" ? col : "#eef1f6"} fontSize={n.rol === "tool" ? 13 : 12} textAnchor="middle" fontFamily={n.rol === "tool" ? "Consolas, monospace" : "inherit"}>
                    {etiqueta}
                  </text>
                </g>
              );
            })}
            {/* memoria al final */}
            <g>
              <rect x={der + 40} y={110} width={240} height={400} rx={12} fill="#141821" stroke="#262c3a" />
              <text x={der + 60} y={140} fill="#6f7a90" fontSize={12} fontFamily="Consolas, monospace" letterSpacing={2}>MEMORIA</text>
              {cliente ? (
                <>
                  <text x={der + 60} y={172} fill="#eef1f6" fontSize={18} fontWeight={700}>{corta(cliente.nombre, 18)}</text>
                  {cliente.producto && <text x={der + 60} y={196} fill="#aab3c5" fontSize={12}>{corta(`Vende ${cliente.producto}`, 34)}</text>}
                  <text x={der + 60} y={230} fill="#4fd18b" fontSize={12} fontFamily="Consolas, monospace">FORTALEZAS</text>
                  {cliente.fortalezas.slice(0, 3).map((f: string, i: number) => (
                    <text key={"f" + i} x={der + 60} y={250 + i * 18} fill="#eef1f6" fontSize={12}>{corta(f, 32)}</text>
                  ))}
                  <text x={der + 60} y={320} fill="#ff5c5c" fontSize={12} fontFamily="Consolas, monospace">A MEJORAR</text>
                  {cliente.debilidades.slice(0, 3).map((f: string, i: number) => (
                    <text key={"d" + i} x={der + 60} y={340 + i * 18} fill="#eef1f6" fontSize={12}>{corta(f, 32)}</text>
                  ))}
                  <text x={der + 60} y={410} fill="#ffb547" fontSize={12} fontFamily="Consolas, monospace">PITCH</text>
                  {cliente.pitches.slice(-4).map((p: any, i: number) => (
                    <g key={"p" + i}>
                      <rect x={der + 60 + i * 52} y={425} width={44} height={44} rx={8} fill={p.puntaje != null ? `hsl(${(p.puntaje / 10) * 120}, 70%, 45%)` : "#262c3a"} />
                      <text x={der + 82 + i * 52} y={445} fill="#fff" fontSize={11} textAnchor="middle" fontFamily="Consolas, monospace">v{p.version}</text>
                      <text x={der + 82 + i * 52} y={461} fill="#fff" fontSize={13} textAnchor="middle" fontWeight={700}>{p.puntaje != null ? `${p.puntaje}` : "–"}</text>
                    </g>
                  ))}
                  {cliente.progreso && <text x={der + 60} y={495} fill="#aab3c5" fontSize={11}>{corta(cliente.progreso, 36)}</text>}
                </>
              ) : (
                <text x={der + 60} y={172} fill="#6f7a90" fontSize={13}>Sin persona identificada</text>
              )}
            </g>
            <text x={20} y={H - 20} fill="#6f7a90" fontSize={12} fontFamily="Consolas, monospace">
              cada herramienta se une a lo que la disparó (persona) y a lo que produjo (coach) · colores: memoria azul · guardar morado · pitch verde · generar ámbar · investigar naranja
            </text>
          </svg>
        </div>
      )}
    </main>
  );
}
