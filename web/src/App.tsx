import { useEffect, useRef, useState } from "react";
import * as VapiModulo from "@vapi-ai/web";
import { useMutation, useQuery } from "convex/react";

// @vapi-ai/web se publica en CommonJS; con Vite el default llega a veces como `.default` y a veces como el módulo entero.
const Vapi: any = (VapiModulo as any).default?.default ?? (VapiModulo as any).default ?? VapiModulo;
import { api } from "../../convex/_generated/api";

// TOKENGATE — la página del vendedor: botón de llamada (Vapi Web SDK), cara del robot, transcript en vivo y panel de memoria.
// Las tools las ejecuta Convex por webhook; aquí solo se ve la conversación y se manda el estado del cuerpo.

type Estado = "idle" | "escuchando" | "pensando" | "hablando" | "anotando";
type Linea = { rol: "user" | "assistant"; texto: string; final: boolean };

const PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY as string | undefined;
const ASSISTANT_ID = import.meta.env.VITE_VAPI_ASSISTANT_ID as string | undefined;

export default function App() {
  const [estado, setEstado] = useState<Estado>("idle");
  const [enLlamada, setEnLlamada] = useState(false);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<"robot" | "panel">("robot");
  const vapiRef = useRef<any>(null);
  const setCuerpo = useMutation(api.panel.setCuerpo);
  const clientes = useQuery(api.panel.clientes) ?? [];
  const insights = useQuery(api.panel.insights) ?? [];
  const recientes = useQuery(api.conversations.recientes, { n: 6 }) ?? [];

  const cambiar = (e: Estado) => {
    setEstado(e);
    setCuerpo({ estado: e }).catch(() => {});
  };

  useEffect(() => {
    if (!PUBLIC_KEY) return;
    const vapi = new Vapi(PUBLIC_KEY);
    vapiRef.current = vapi;
    vapi.on("call-start", () => {
      setEnLlamada(true);
      setLineas([]);
      cambiar("escuchando");
    });
    vapi.on("call-end", () => {
      setEnLlamada(false);
      cambiar("idle");
    });
    vapi.on("speech-start", () => cambiar("hablando"));
    vapi.on("speech-end", () => cambiar("escuchando"));
    vapi.on("error", (e: any) => {
      const texto = typeof e === "string" ? e : e?.error?.message ?? e?.message ?? e?.errorMsg ?? JSON.stringify(e).slice(0, 300);
      console.warn("vapi error", e);
      // Avisos benignos al colgar (meeting ended / ejected) no se muestran.
      if (/ended|ejected|left/i.test(texto)) return;
      setError(texto);
    });
    vapi.on("message", (m: any) => {
      if (m?.type === "transcript" && m.transcript) {
        const rol: "user" | "assistant" = m.role === "assistant" ? "assistant" : "user";
        const final = m.transcriptType === "final";
        setLineas((prev) => {
          const ultima = prev[prev.length - 1];
          if (ultima && !ultima.final && ultima.rol === rol) {
            return [...prev.slice(0, -1), { rol, texto: m.transcript, final }];
          }
          return [...prev, { rol, texto: m.transcript, final }].slice(-14);
        });
        if (rol === "user" && final) cambiar("pensando");
      }
      if (m?.type === "tool-calls") {
        cambiar("anotando");
        setTimeout(() => setEstado((e) => (e === "anotando" ? "pensando" : e)), 700);
      }
    });
    return () => {
      vapi.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "p" || ev.key === "P") setVista((v) => (v === "robot" ? "panel" : "robot"));
      if (ev.key === "Escape") setVista("robot");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const iniciarLlamada = async () => {
    setError(null);
    if (!vapiRef.current || !ASSISTANT_ID) {
      setError("Faltan VITE_VAPI_PUBLIC_KEY o VITE_VAPI_ASSISTANT_ID en web/.env.local");
      return;
    }
    try {
      await vapiRef.current.start(ASSISTANT_ID);
    } catch (e) {
      setError(String((e as any)?.message ?? e));
    }
  };

  const alternar = async () => {
    if (enLlamada) vapiRef.current?.stop();
    else await iniciarLlamada();
  };

  // ---- Palabra de activación: "hola robot" (Web Speech API del navegador, Chrome/Edge) ----
  // En espera, la página escucha sola; al oír "hola robot" arranca la llamada de Vapi. Al colgar, vuelve a esperar.
  const [despierto, setDespierto] = useState(true);
  const [oyendoClave, setOyendoClave] = useState(false);
  const recRef = useRef<any>(null);
  const enLlamadaRef = useRef(false);
  enLlamadaRef.current = enLlamada;
  const despiertoRef = useRef(true);
  despiertoRef.current = despierto;

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    let parado = false;
    const rec = new SR();
    rec.lang = "es-CO";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onstart = () => setOyendoClave(true);
    rec.onend = () => {
      setOyendoClave(false);
      // Chrome corta el reconocimiento cada cierto tiempo: relanzar mientras no haya llamada.
      if (!parado && despiertoRef.current && !enLlamadaRef.current) setTimeout(() => { try { rec.start(); } catch { /* ya activo */ } }, 400);
    };
    rec.onerror = () => setOyendoClave(false);
    rec.onresult = (ev: any) => {
      let texto = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) texto += ev.results[i][0].transcript + " ";
      const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (/hola,?\s*(robot|token\s*gate|tokengate|lumi)/.test(t) && !enLlamadaRef.current) {
        try { rec.stop(); } catch { /* nada */ }
        iniciarLlamada();
      }
    };
    recRef.current = rec;
    if (despierto && !enLlamada) { try { rec.start(); } catch { /* nada */ } }
    return () => { parado = true; try { rec.stop(); } catch { /* nada */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [despierto, enLlamada]);

  return (
    <div className="app">
      <header>
        <div className="marca">TOKENGATE</div>
        <div className="sub">tu coach de pitch, con memoria</div>
        <div className="teclas">P: panel · Esc: robot</div>
      </header>

      {vista === "robot" ? (
        <main className="robot">
          <Cara estado={estado} />
          <div className={`estado e-${estado}`}>{ETIQUETA[estado]}</div>
          <button className={`llamar ${enLlamada ? "activo" : ""}`} onClick={alternar}>
            {enLlamada ? "Colgar" : "Hablar con el robot"}
          </button>
          <label className="despertar">
            <input type="checkbox" checked={despierto} onChange={(e) => setDespierto(e.target.checked)} />
            {oyendoClave && !enLlamada ? "Esperando \"Hola robot\"..." : despierto ? "Activar por voz (\"Hola robot\")" : "Activación por voz apagada"}
          </label>
          {error && <div className="error">{error}</div>}
          <div className="transcript">
            {lineas.length === 0 && <div className="vacio">Di "Hola robot" y luego preséntate: "Soy ..., de ..."</div>}
            {lineas.map((l, i) => (
              <div key={i} className={`linea ${l.rol} ${l.final ? "" : "parcial"}`}>
                <span className="quien">{l.rol === "user" ? "Tú" : "Vendedor"}</span>
                {l.texto}
              </div>
            ))}
          </div>
        </main>
      ) : (
        <main className="panel">
          <section>
            <h2>Personas y su pitch</h2>
            <div className="tarjetas">
              {clientes.map((c) => (
                <article key={c._id} className="cliente">
                  <div className="nombre">
                    {c.nombre}
                    {c.empresa && <span> · {c.empresa}</span>}
                    <span className={`etapa ${c.etapa}`}>{c.etapa}</span>
                  </div>
                  {c.producto && <p className="resumen">Vende {c.producto}{c.audiencia ? ` a ${c.audiencia}` : ""}.</p>}
                  {c.resumen && <p className="resumen">{c.resumen}</p>}
                  <div className="chips">
                    {c.fortalezas.map((x: string) => (
                      <span key={"f" + x} className="chip interes">{x}</span>
                    ))}
                    {c.debilidades.map((x: string) => (
                      <span key={"d" + x} className="chip objecion">{x}</span>
                    ))}
                  </div>
                  {c.pitches.length > 0 && (
                    <div className="siguiente">
                      <span>
                        {c.pitches.length} versión{c.pitches.length === 1 ? "" : "es"} del pitch ·{" "}
                        {c.pitches.map((p: any) => (p.puntaje != null ? `v${p.version}: ${p.puntaje}/10` : `v${p.version}`)).join(" → ")}
                      </span>
                      {c.progreso && <span>Progreso: {c.progreso}</span>}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
          <section className="lateral">
            <h2>Lo que el coach aprendió</h2>
            {insights.length === 0 && <div className="vacio">Todavía sin conversaciones cerradas.</div>}
            {insights.map((i) => (
              <div key={i._id} className="insight">
                <div className="clave">{i.clave.replace(/_/g, " ")}</div>
                <div className="valor">{i.valor}</div>
                <div className="evidencia">{i.evidencia} conversaciones</div>
              </div>
            ))}
            <h2>Conversaciones</h2>
            {recientes.map((c) => (
              <div key={c._id} className="conv">
                <span className="quien">{c.cliente ?? "sin identificar"}</span>
                <span className="res">{c.resultado?.replace("_", " ") ?? (c.fin ? "sin resultado" : "en curso")}</span>
                {c.resumen && <span className="res-txt">{c.resumen}</span>}
              </div>
            ))}
          </section>
        </main>
      )}
    </div>
  );
}

const ETIQUETA: Record<Estado, string> = {
  idle: "Pulsa para hablar",
  escuchando: "Escuchando",
  pensando: "Pensando",
  hablando: "Hablando",
  anotando: "Anotando",
};

function Cara({ estado }: { estado: Estado }) {
  return (
    <div className={`cara ${estado}`} aria-label={`Robot ${ETIQUETA[estado]}`} role="img">
      <div className="ojo izq"><div className="pupila" /></div>
      <div className="ojo der"><div className="pupila" /></div>
      <div className="boca" />
    </div>
  );
}
