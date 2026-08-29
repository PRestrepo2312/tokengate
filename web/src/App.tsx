import { useEffect, useRef, useState } from "react";
import * as VapiModulo from "@vapi-ai/web";
import { useMutation, useQuery } from "convex/react";

// @vapi-ai/web se publica en CommonJS; con Vite el default llega a veces como `.default` y a veces como el módulo entero.
const Vapi: any = (VapiModulo as any).default?.default ?? (VapiModulo as any).default ?? VapiModulo;
import { api } from "../../convex/_generated/api";
import Grafo from "./Grafo";

// TOKENGATE — la página del vendedor: botón de llamada (Vapi Web SDK), cara del robot, transcript en vivo y panel de memoria.
// Las tools las ejecuta Convex por webhook; aquí solo se ve la conversación y se manda el estado del cuerpo.

type Estado = "idle" | "dormido" | "escuchando" | "pensando" | "hablando" | "anotando" | "aburrido" | "confundido" | "impresionado";

// Señales con fundamento sobre lo que dice la persona (specs/03): nunca se disparan mientras el coach habla.
const MULETILLAS = /\b(eh|este|o sea|digamos|como que|basicamente|básicamente|tipo|pues|bueno)\b/gi;
const CIFRA = /\b\d+([.,]\d+)?\s*(%|por ciento|mil|millones|millón|pesos|dólares|dolares|clientes|empresas|usuarios|ventas|minutos|horas|días|dias|años|anos)\b/i;
const MONOLOGO_S = 30;
type Linea = { rol: "user" | "assistant"; texto: string; final: boolean };

const PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY as string | undefined;
const ASSISTANT_ID = import.meta.env.VITE_VAPI_ASSISTANT_ID as string | undefined;

export default function App() {
  const [estado, setEstado] = useState<Estado>("dormido");
  const [enLlamada, setEnLlamada] = useState(false);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<"robot" | "panel" | "grafo">("robot");
  const vapiRef = useRef<any>(null);
  const setCuerpo = useMutation(api.panel.setCuerpo);
  const clientes = useQuery(api.panel.clientes) ?? [];
  const insights = useQuery(api.panel.insights) ?? [];
  const recientes = useQuery(api.conversations.recientes, { n: 6 }) ?? [];

  const [razon, setRazon] = useState("");
  const cambiar = (e: Estado, porQue = "") => {
    setEstado(e);
    setRazon(porQue);
    setCuerpo({ estado: e, razon: porQue }).catch(() => {});
  };

  // Fundamento de las emociones: cuánto lleva hablando la persona sin que el coach intervenga, muletillas, cifras.
  const habla = useRef({ inicioUsuario: 0, coachHablando: false, muletillas: 0, ultimoAviso: 0 });
  const volverAEscuchar = () => {
    habla.current.inicioUsuario = 0;
    habla.current.muletillas = 0;
    cambiar("escuchando");
  };

  useEffect(() => {
    if (!PUBLIC_KEY) return;
    const vapi = new Vapi(PUBLIC_KEY);
    vapiRef.current = vapi;
    vapi.on("call-start", () => {
      setEnLlamada(true);
      setLineas([]);
      volverAEscuchar();
    });
    vapi.on("call-end", () => {
      setEnLlamada(false);
      cambiar("dormido", "Di \"Hola Token\" para despertarme");
    });
    vapi.on("speech-start", () => {
      habla.current.coachHablando = true;
      habla.current.inicioUsuario = 0;
      cambiar("hablando");
    });
    vapi.on("speech-end", () => {
      habla.current.coachHablando = false;
      volverAEscuchar();
    });
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
        if (rol === "user" && !habla.current.coachHablando) {
          const h = habla.current;
          const ahora = Date.now();
          if (!h.inicioUsuario) h.inicioUsuario = ahora;
          const seg = (ahora - h.inicioUsuario) / 1000;
          if (final) {
            const texto = String(m.transcript);
            const nuevas = (texto.match(MULETILLAS) || []).length;
            h.muletillas += nuevas;
            if (CIFRA.test(texto)) {
              h.muletillas = 0;
              if (ahora - h.ultimoAviso > 4000) { h.ultimoAviso = ahora; cambiar("impresionado", "Una cifra concreta: bien"); }
              return;
            }
            if (h.muletillas >= 3 && ahora - h.ultimoAviso > 6000) {
              h.ultimoAviso = ahora; h.muletillas = 0;
              cambiar("confundido", "Tres muletillas seguidas");
              return;
            }
          }
          if (seg > MONOLOGO_S && ahora - h.ultimoAviso > 15000) {
            h.ultimoAviso = ahora;
            cambiar("aburrido", `Llevas ${Math.round(seg)} s hablando sin parar`);
            return;
          }
          if (final) cambiar("pensando");
        }
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

  // Al abrir la página el robot está dormido hasta oír "Hola Token".
  useEffect(() => {
    cambiar("dormido", "Di \"Hola Token\" para despertarme");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (ev.key === "p" || ev.key === "P") setVista((v) => (v === "panel" ? "robot" : "panel"));
      if (ev.key === "g" || ev.key === "G") setVista((v) => (v === "grafo" ? "robot" : "grafo"));
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
      if (/hola,?\s*(robot|token\s*gate|tokengate|token|toquen|lumi)/.test(t) && !enLlamadaRef.current) {
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
        <div className="sub">tu compañero de tareas, con memoria</div>
        <div className="teclas">P: panel · G: cómo pensó · Esc: robot</div>
      </header>

      {vista === "grafo" ? (
        <Grafo onCerrar={() => setVista("robot")} />
      ) : vista === "robot" ? (
        <main className="robot">
          <Cara estado={estado} />
          <div className={`estado e-${estado}`}>{ETIQUETA[estado]}</div>
          {razon && <div className="razon">{razon}</div>}
          <button className={`llamar ${enLlamada ? "activo" : ""}`} onClick={alternar}>
            {enLlamada ? "Terminar" : "Hablar con Token"}
          </button>
          <label className="despertar">
            <input type="checkbox" checked={despierto} onChange={(e) => setDespierto(e.target.checked)} />
            {oyendoClave && !enLlamada ? "Esperando \"Hola Token\"..." : despierto ? "Activar por voz (\"Hola Token\")" : "Activación por voz apagada"}
          </label>
          {error && <div className="error">{error}</div>}
          <div className="transcript">
            {lineas.length === 0 && <div className="vacio">Di "Hola Token" y cuéntale cómo te llamas y qué tarea traes</div>}
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
            <h2>Niños y lo que están aprendiendo</h2>
            <div className="tarjetas">
              {clientes.map((c) => (
                <article key={c._id} className="cliente">
                  <div className="nombre">
                    {c.nombre}
                    {c.empresa && <span> · {c.empresa}</span>}
                    <span className={`etapa ${c.etapa}`}>{c.etapa}</span>
                  </div>
                  {c.producto && <p className="resumen">Tema: {c.producto}{c.audiencia ? ` · ${c.audiencia}` : ""}.</p>}
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
                        {c.pitches.length} trabajo{c.pitches.length === 1 ? "" : "s"} guardado{c.pitches.length === 1 ? "" : "s"} ·{" "}
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
            <h2>Lo que Token ha visto</h2>
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
  dormido: "Dormido",
  escuchando: "Escuchando",
  pensando: "Pensando",
  hablando: "Hablando",
  anotando: "Anotando",
  aburrido: "Aburrido",
  confundido: "Confundido",
  impresionado: "Impresionado",
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
