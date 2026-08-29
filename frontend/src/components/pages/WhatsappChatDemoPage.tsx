import { useState, useEffect, useRef } from "react";
import { Phone, Send, RotateCcw, MessageCircle } from "lucide-react";
import { api } from "../../services/api";
import { demoGetHilo, demoSaveHilo, demoBorrarHilo, type Mensaje } from "../../utils/whatsappDemoStore";

/*
 * Simulador de WhatsApp para clientes finales: escribe como si fuera un
 * cliente del número seleccionado y prueba el MISMO motor que usa el
 * circuito real de pedidos por WhatsApp (solo notas de pedido).
 *
 * Los mensajes de prueba quedan guardados en memoria mientras la app
 * está abierta: se conservan al cambiar de pantalla.
 */

const IDEAS = [
  "Hola, mandame 10 bolsas de cemento y 5 cal",
  "sacá la cal",
  "poneme 8 mejor",
  "agregame 4 arena fina",
  "cambiame el cemento por cal",
  "cuánto llevo hasta ahora",
  "cuánto tengo de saldo",
  "mandalo a la obra de San Martín",
  "hacé lo mismo que el viernes",
  "cerralo",
];

export function WhatsappChatDemoPage() {
  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [telefono, setTelefono] = useState("5493454001234");
  const [otroTelefono, setOtroTelefono] = useState("");
  const [threads, setThreads] = useState<Record<string, Mensaje[]>>({});
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const finRef = useRef<HTMLDivElement>(null);
  const threadsRef = useRef<Record<string, Mensaje[]>>({});

  async function loadNumeros() {
    try {
      const r = await api.listWhatsappOrderRequests("");
      const s = (r.solicitudes || []).map((x: any) => ({ telefono: x.telefono, nombre: x.nombre_declarado || x.cliente_nombre || "—", estado: x.estado }));
      setSolicitudes(s);
      if (s.some((x: any) => x.telefono === telefono)) return;
      const aprobado = s.find((x: any) => x.estado === "APROBADO");
      if (aprobado) setTelefono(aprobado.telefono);
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => { loadNumeros(); }, []);
  useEffect(() => {
    const inicial: Record<string, Mensaje[]> = {};
    for (const s of solicitudes) inicial[s.telefono] = demoGetHilo(s.telefono);
    Object.keys(inicial).forEach(k => { threadsRef.current[k] = inicial[k]; });
    setThreads(p => ({ ...p, ...inicial }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitudes.length]);
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [threads, telefono]);

  const hilo: Mensaje[] = threadsRef.current[otroTelefono.trim() || telefono] || [];
  const bot = (texto: string, estado?: string): Mensaje => ({ id: Date.now() + Math.random(), de: "bot", texto, hora: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }), estado });
  const cli = (texto: string): Mensaje => ({ id: Date.now() + Math.random(), de: "cliente", texto, hora: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) });

  function guardar(numero: string, mensajes: Mensaje[]) {
    const next = { ...threadsRef.current, [numero]: mensajes };
    threadsRef.current = next;
    demoSaveHilo(numero, mensajes);
    setThreads(next);
  }

  async function sugerir(idea: string) {
    const numero = otroTelefono.trim() || telefono;
    guardar(numero, [...(threadsRef.current[numero] || []), cli(idea)]);
    await responder(numero, idea);
  }

  async function responder(numero: string, mensaje: string) {
    setBusy(true);
    setError("");
    try {
      const r = await api.whatsappDemoMessage(numero, mensaje);
      const msgs = threadsRef.current[numero] || [];
      if (r.estado === "PENDIENTE_APROBACION") {
        guardar(numero, [...msgs, bot(r.respuesta, "esperando alta")]);
      } else if (r.estado === "RECHAZADO") {
        guardar(numero, [...msgs, bot(r.respuesta, "rechazado")]);
      } else {
        const resp = r.response?.message || r.respuesta || "Listo.";
        guardar(numero, [...msgs, bot(resp, r.conversation?.estado || r.estado || "")]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function enviar() {
    const mensaje = texto.trim();
    if (!mensaje || busy) return;
    setTexto("");
    const numero = otroTelefono.trim() || telefono;
    guardar(numero, [...(threadsRef.current[numero] || []), cli(mensaje)]);
    await responder(numero, mensaje);
  }

  async function reiniciar() {
    const numero = otroTelefono.trim() || telefono;
    if (!confirm("¿Reiniciar la conversación de prueba de este número? El hilo del servidor arranca de cero.")) return;
    setError("");
    try {
      await api.whatsappDemoMessage(numero, "", true);
      demoBorrarHilo(numero);
      guardar(numero, []);
    } catch (e: any) {
      setError(e.message);
    }
  }

  const numeroActual = otroTelefono.trim() || telefono;

  return <div className="products-page wa-demo-page">
    <div className="products-toolbar">
      <div><h3>Asistente WhatsApp (demo)</h3><p>Simulá el teléfono de un cliente final. Usa el mismo motor que el circuito de Pedidos por WhatsApp: solo toma notas de pedido; si el número todavía no está aprobado, lo registra y lo veás en “Pedidos por WhatsApp” para habilitarlo.</p></div>
      <button className="secondary-action" onClick={reiniciar} disabled={busy}><RotateCcw size={16} /> Reiniciar conversación</button>
    </div>
    {error && <div className="error-box">{error}</div>}
    <div className="wa-demo-layout">
      <aside className="wa-demo-lista">
        <div><strong>Números disponibles</strong><small>Seleccioná el teléfono que “escribe”</small></div>
        <select value={telefono} onChange={e => { setOtroTelefono(""); setTelefono(e.target.value); }}>
          {solicitudes.map((s: any) => <option key={s.telefono} value={s.telefono}>{s.telefono} · {s.nombre} ({s.estado})</option>)}
          {!solicitudes.some((s: any) => s.telefono === telefono) && <option value={telefono}>{telefono}</option>}
        </select>
        <label>Otro número<small>Probás con un número que no esté en la lista: queda como solicitud pendiente</small><input value={otroTelefono} onChange={e => setOtroTelefono(e.target.value)} placeholder="Ej.: 5493400998877" /></label>
        <label>Resumen de la charla</label>
        <div className="wa-demo-ideas">
          <small>Ideas para probar:</small>
          {IDEAS.map(idea => <button key={idea} disabled={busy} onClick={() => sugerir(idea)}>{idea}</button>)}
        </div>
      </aside>
      <section className="wa-demo-chat">
        <header>
          <div className="wa-demo-avatar"><MessageCircle size={20} /></div>
          <div><strong>{solicitudes.find((s: any) => s.telefono === numeroActual)?.nombre || "Cliente nuevo"}</strong><span>{numeroActual} · WhatsApp</span></div>
        </header>
        <div className="wa-demo-body">
          {hilo.length === 0 && <div className="empty-table wa-demo-vacia">Elegí una idea de la izquierda o escribí el pedido abajo. Así le va a aparecer a tu cliente por WhatsApp.</div>}
          {hilo.map(m => <div key={m.id} className={`wa-bubble ${m.de === "cliente" ? "sent" : "in"}`}>
            <span>{m.texto}</span>
            <div className="wa-bubble-meta">{m.hora}{m.estado ? <b> · {m.estado}</b> : null}</div>
          </div>)}
          <div ref={finRef} />
        </div>
        <footer>
          <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === "Enter" && enviar()} placeholder="Escribí como el cliente..." disabled={busy} />
          <button onClick={enviar} disabled={busy || !texto.trim()}><Send size={18} /></button>
        </footer>
      </section>
    </div>
    <div className="info-note"><Phone size={16} /> El circuito real: Meta WhatsApp Business + n8n envía el mensaje a <code>/api/v1/whatsapp/pedidos/message</code> y el sistema contesta por la API oficial. Acá probás el mismo motor sin necesidad de WhatsApp ni n8n.</div>
  </div>;
}
