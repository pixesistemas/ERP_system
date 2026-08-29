import { useState, useEffect, useRef } from "react";
import { Briefcase, Send, RotateCcw, MessageCircle } from "lucide-react";
import { api, erpApi } from "../../services/api";
import { empleadoGetHilo, empleadoSaveHilo, empleadoBorrarHilo, empleadoDesencolarMensaje, type Mensaje } from "../../utils/whatsappEmpleadoStore";

/*
 * Simulador de WhatsApp para EMPLEADOS de la empresa: el teléfono es de un
 * integrante del equipo (whatsapp_autorizados), con TODAS las operaciones
 * disponibles — facturas, presupuestos, reservas, remitos y facturar o
 * remitir pendientes de notas de pedido.
 */

const IDEAS = [
  "una factura para Carlos López con 2 cemento portland y 3 cal",
  "arma un presupuesto para Juan Pérez por 10 cemento portland",
  "hace una reserva de 5 cal para Carlos López con entrega para mañana",
  "remití la nota de pedido 0001-00000010",
  "facturá la nota de pedido 0001-00000010",
  "retirá la reserva de saldo de Juan Pérez",
];

export function WhatsappEmpleadoDemoPage() {
  const [numeros, setNumeros] = useState<any[]>([]);
  const [telefono, setTelefono] = useState("");
  const [threads, setThreads] = useState<Record<string, Mensaje[]>>({});
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [arrancado, setArrancado] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const threadsRef = useRef<Record<string, Mensaje[]>>({});

  async function loadNumeros() {
    try {
      const r = await erpApi.listWhatsappAuthorized();
      const s = (r.authorizedPhones || r.whatsapp || r.rows || []).map((x: any) => ({ telefono: x.telefono, nombre: x.nombre || x.telefono, activo: x.activo !== 0 && x.activo !== false }));
      setNumeros(s);
      if (!telefono && s.length) setTelefono(String(s.find((x: any) => x.activo)?.telefono || s[0].telefono));
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => { loadNumeros(); }, []);
  useEffect(() => {
    const inicial: Record<string, Mensaje[]> = {};
    for (const n of numeros) inicial[n.telefono] = empleadoGetHilo(n.telefono);
    Object.keys(inicial).forEach(k => { threadsRef.current[k] = inicial[k]; });
    setThreads(p => ({ ...p, ...inicial }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numeros.length]);
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [threads, telefono]);

  const numeroActual = telefono;
  const hilo: Mensaje[] = threadsRef.current[numeroActual] || [];
  const bot = (texto: string, estado?: string): Mensaje => ({ id: Date.now() + Math.random(), de: "cliente", texto, hora: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }), estado });
  const cli = (texto: string): Mensaje => ({ id: Date.now() + Math.random(), de: "cliente", texto, hora: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) });

  function guardar(numero: string, mensajes: Mensaje[]) {
    const next = { ...threadsRef.current, [numero]: mensajes };
    threadsRef.current = next;
    empleadoSaveHilo(numero, mensajes);
    setThreads(next);
  }

  async function responder(numero: string, mensaje: string) {
    setBusy(true);
    setError("");
    try {
      const r = await api.whatsappDemoEmpleadoMessage(numero, mensaje);
      const msgs = threadsRef.current[numero] || [];
      const resp = r.response?.message || r.respuesta || "Listo.";
      guardar(numero, [...msgs, bot(resp, r.conversation?.estado || r.documento?.tipo || "")]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function enviar(msj?: string) {
    const mensaje = (msj ?? texto).trim();
    if (!mensaje || busy || !numeroActual) return;
    setTexto("");
    guardar(numeroActual, [...(threadsRef.current[numeroActual] || []), cli(mensaje)]);
    await responder(numeroActual, mensaje);
  }

  async function sugerir(idea: string) {
    if (!numeroActual || busy) return;
    guardar(numeroActual, [...(threadsRef.current[numeroActual] || []), cli(idea)]);
    await responder(numeroActual, idea);
  }

  async function reiniciar() {
    if (!numeroActual) return;
    if (!confirm("¿Reiniciar la conversación de prueba de este número? El hilo del servidor arranca de cero.")) return;
    setError("");
    try {
      await api.whatsappDemoEmpleadoMessage(numeroActual, "", true);
      empleadoBorrarHilo(numeroActual);
      guardar(numeroActual, []);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    if (!numeroActual || arrancado) return;
    const pendiente = empleadoDesencolarMensaje();
    if (pendiente) {
      setArrancado(true);
      setTimeout(() => enviar(pendiente), 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numeroActual, arrancado]);

  return <div className="products-page wa-demo-page">
    <div className="products-toolbar">
      <div><h3>Asistente WhatsApp — Empleados (demo)</h3><p>Simulá el teléfono de un integrante de tu equipo (los de “WhatsApp autorizados”). Podés facturar, presupuestar, reservar, remitir y facturar pendientes desde el chat, igual que lo haría el bot real.</p></div>
      <button className="secondary-action" onClick={reiniciar} disabled={busy}><RotateCcw size={16} /> Reiniciar conversación</button>
    </div>
    {error && <div className="error-box">{error}</div>}
    <div className="wa-demo-layout">
      <aside className="wa-demo-lista">
        <div><strong>Empleados autorizados</strong><small>Seleccioná el teléfono del empleado que “escribe”</small></div>
        <select value={telefono} onChange={e => setTelefono(e.target.value)}>
          {numeros.map((s: any) => <option key={s.telefono} value={s.telefono}>{s.telefono} · {s.nombre}{s.activo ? "" : " (inactivo)"}</option>)}
        </select>
        <label>Resumen de la charla</label>
        <div className="wa-demo-ideas">
          <small>Ideas para probar:</small>
          {IDEAS.map(idea => <button key={idea} disabled={busy} onClick={() => sugerir(idea)}>{idea}</button>)}
        </div>
      </aside>
      <section className="wa-demo-chat">
        <header>
          <div className="wa-demo-avatar"><Briefcase size={20} /></div>
          <div><strong>{numeros.find((s: any) => s.telefono === numeroActual)?.nombre || "Empleado"}</strong><span>{numeroActual} · WhatsApp</span></div>
        </header>
        <div className="wa-demo-body">
          {hilo.length === 0 && <div className="empty-table wa-demo-vacia">Elegí una idea de la izquierda o escribí la operación. Así le aparece al empleado por WhatsApp.</div>}
          {hilo.map(m => <div key={m.id} className={`wa-bubble ${m.de === "cliente" ? "sent" : "in"}`}>
            <span>{m.texto}</span>
            <div className="wa-bubble-meta">{m.hora}{m.estado ? <b> · {m.estado}</b> : null}</div>
          </div>)}
          <div ref={finRef} />
        </div>
        <footer>
          <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === "Enter" && enviar()} placeholder="Escribí como el empleado..." disabled={busy} />
          <button onClick={() => enviar()} disabled={busy || !texto.trim() || !numeroActual}><Send size={18} /></button>
        </footer>
      </section>
    </div>
    <div className="info-note"><MessageCircle size={16} /> El circuito real del equipo: donde tengas n8n + WhatsApp Business configurado, los empleados hablan al bot con sus números autorizados y el sistema ejecuta la operación con confirmación. Acá probás ese mismo motor.</div>
  </div>;
}
