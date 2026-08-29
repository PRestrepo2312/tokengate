import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

// Grafo de conocimiento por niño, público (URL#conocimiento): lo que hay en la base para cada uno.
// Centro: el niño. Anillo: tema (ámbar), le va bien (verde), le cuesta (rojo), trucos que funcionaron (morado), lo que le gusta (azul).

type Nodo = { texto: string; color: string; tipo: string };

function corta(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function GrafoNino({ c }: { c: any }) {
  const W = 520, H = 400, cx = W / 2, cy = H / 2 - 10;
  const nodos: Nodo[] = [];
  if (c.producto) nodos.push({ texto: c.producto, color: "#ffb547", tipo: "tema" });
  if (c.diferencial) nodos.push({ texto: c.diferencial, color: "#4f8cff", tipo: "le gusta" });
  (c.fortalezas ?? []).slice(0, 4).forEach((t: string) => nodos.push({ texto: t, color: "#4fd18b", tipo: "le va bien" }));
  (c.debilidades ?? []).slice(0, 4).forEach((t: string) => nodos.push({ texto: t, color: "#ff5c5c", tipo: "le cuesta" }));
  (c.feedback ?? []).slice(-3).forEach((t: string) => nodos.push({ texto: t, color: "#9d7bff", tipo: "truco" }));
  const n = Math.max(nodos.length, 1);
  const R = 150;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Conocimiento de ${c.nombre}`}>
      {nodos.map((nd, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
        const izq = Math.cos(a) < -0.2, der = Math.cos(a) > 0.2;
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke={nd.color} strokeWidth={2} opacity={0.5} />
            <circle cx={x} cy={y} r={9} fill={nd.color} stroke="#0b0d12" strokeWidth={2} />
            <text x={x + (der ? 14 : izq ? -14 : 0)} y={y + (der || izq ? 4 : Math.sin(a) < 0 ? -16 : 24)} fill="#eef1f6" fontSize={12} textAnchor={der ? "start" : izq ? "end" : "middle"}>
              {corta(nd.texto, 34)}
            </text>
            <text x={x + (der ? 14 : izq ? -14 : 0)} y={y + (der || izq ? 18 : Math.sin(a) < 0 ? -4 : 38)} fill={nd.color} fontSize={10} textAnchor={der ? "start" : izq ? "end" : "middle"} fontFamily="Consolas, monospace" letterSpacing={1}>
              {nd.tipo.toUpperCase()}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={46} fill="#141821" stroke="#4f8cff" strokeWidth={3} />
      <text x={cx} y={cy - 2} fill="#eef1f6" fontSize={16} fontWeight={700} textAnchor="middle">{corta(c.nombre, 14)}</text>
      <text x={cx} y={cy + 16} fill="#aab3c5" fontSize={11} textAnchor="middle">{corta(c.audiencia ?? c.empresa ?? "", 18)}</text>
      <text x={cx} y={H - 30} fill="#aab3c5" fontSize={12} textAnchor="middle">
        {c.sesiones ?? 0} sesión{(c.sesiones ?? 0) === 1 ? "" : "es"}{c.pitches?.length ? ` · ${c.pitches.length} trabajo${c.pitches.length === 1 ? "" : "s"}` : ""}
      </text>
      {c.progreso && <text x={cx} y={H - 12} fill="#6f7a90" fontSize={11} textAnchor="middle">{corta(c.progreso, 70)}</text>}
      {nodos.length === 0 && <text x={cx} y={cy + 80} fill="#6f7a90" fontSize={12} textAnchor="middle">Todavía no hay memoria de esta sesión</text>}
    </svg>
  );
}

export default function Conocimiento({ onCerrar }: { onCerrar: () => void }) {
  const ninos = useQuery(api.panel.clientes) ?? [];
  const insights = useQuery(api.panel.insights) ?? [];
  return (
    <main className="conocimiento">
      <div className="grafo-cab">
        <h2>Lo que Tokenpirin sabe de cada niño</h2>
        <span className="teclas">C o Esc: volver · enlace público: #conocimiento</span>
        <button className="cerrar" onClick={onCerrar}>Volver</button>
      </div>
      {ninos.length === 0 && <div className="vacio">Todavía nadie ha hablado con Tokenpirin. Di "Hola Tokenpirin" y cuéntale tu tarea.</div>}
      <div className="ninos">
        {ninos.map((c: any) => (
          <article key={c._id} className="nino">
            <GrafoNino c={c} />
            {c.resumen && <p className="resumen">{c.resumen}</p>}
          </article>
        ))}
      </div>
      {insights.length > 0 && (
        <div className="globales">
          {insights.map((i: any) => (
            <div key={i._id} className="insight">
              <div className="clave">{i.clave.replace(/_/g, " ")}</div>
              <div className="valor">{i.valor}</div>
              <div className="evidencia">{i.evidencia} {i.clave === "sesiones" ? "" : "niños"}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
