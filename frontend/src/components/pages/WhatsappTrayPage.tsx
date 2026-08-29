import { useState, useEffect } from "react";
import { Phone, UserRound, PackagePlus, RotateCcw, Check, Clock, Send, Bell } from "lucide-react";
import { api } from "../../services/api";
import { fmtFechaHora } from "../../utils/fecha";

const RAPIDAS = ["Confirmá tu pedido, por favor", "¿Querés modificar algo de tu pedido?", "Te avisamos cuando esté listo para retirar", "¿Algo más?"];

export function WhatsappTrayPage() {
  const [convs, setConvs] = useState<any[]>([]);
  const [notis, setNotis] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [respBot, setRespBot] = useState<Record<number, string>>({});
  const [cfg, setCfg] = useState<any>({ token: "", phoneId: "", numero: "", verifyToken: "", activo: false });
  const [cfgMsg, setCfgMsg] = useState("");
  const [pedidos, setPedidos] = useState<any[]>([]);

  async function loadPedidos() {
    try {
      const r = await api.listWhatsappPedidos();
      setPedidos(r.pedidos || []);
    } catch (e: any) { setError(e.message); }
  }
  async function reparto(id: number, estado: string) {
    try {
      await api.cambiarRepartoPedido(id, estado);
      setNotice("Estado de reparto actualizado y notificación generada.");
      await load();
      await loadPedidos();
    } catch (e: any) { setError(e.message); }
  }
  async function enviarPago(id: number) {
    try {
      const r = await api.enviarLinkPago(id);
      setNotice(r.pendiente ? "Notificación de pago encolada (sin conexión activa)." : "Link de pago enviado por WhatsApp.");
      await load();
    } catch (e: any) { setError(e.message); }
  }
  async function verificarPagoN(id: number) {
    try {
      await api.verificarPago(id);
      setNotice("Pago marcado como verificado.");
      await load();
    } catch (e: any) { setError(e.message); }
  }

  async function loadCfg() {
    try {
      const r = await api.getWhatsappConfig();
      if (r.config) setCfg({ token: r.config.token || "", phoneId: r.config.phoneId || "", numero: r.config.numero || "", verifyToken: r.config.verifyToken || "", activo: !!r.config.activo });
    } catch (e: any) { setError(e.message); }
  }
  async function guardarCfg() {
    setCfgMsg("");
    try {
      await api.saveWhatsappConfig({ token: cfg.token, phoneId: cfg.phoneId, numero: cfg.numero, verifyToken: cfg.verifyToken, activo: cfg.activo });
      setCfgMsg("Conexión guardada.");
    } catch (e: any) { setError(e.message); }
  }
  async function probarCfg() {
    setCfgMsg("");
    try {
      const r = await api.probarWhatsappConfig();
      setCfgMsg("Conexión OK: " + (r.info?.nombre || r.info?.verificado || "respondió"));
    } catch (e: any) { setCfgMsg(e.message); setError(e.message); }
  }
  async function enviarNoti(n: any) {
    try {
      await api.enviarNotificacionWhatsapp(n.id);
      setNotice("Notificación enviada por WhatsApp.");
      await load();
    } catch (e: any) { setError(e.message); }
  }

  async function load() {
    setError("");
    try {
      const [r, n] = await Promise.all([api.listWhatsappConversations(), api.listWhatsappNotificaciones()]); loadCfg(); loadPedidos();
      setConvs(r.conversaciones || []);
      setNotis(n.notificaciones || []);
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function tomar(c: any, moderador: boolean) {
    setBusy(c.id);
    try {
      await api.tomarConversacionWhatsapp(c.id, moderador);
      setNotice(moderador ? `Conversación de ${c.telefono} tomada por un vendedor.` : `Conversación de ${c.telefono} devuelta al bot.`);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function enviarRapida(c: any, texto: string) {
    setBusy(c.id);
    setError("");
    try {
      const r = await api.enviarMensajeWhatsapp(c.id, texto);
      setRespBot({ ...respBot, [c.id]: r.enviado ? `Enviada a ${c.telefono}: ${r.respuesta || r.estado || "Mensaje enviado"}` : `${r.respuesta || r.estado || "Mensaje enviado"} (la conexión de WhatsApp no está activa: la tarda de salir)` });
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function crearPedido(c: any) {
    if (!confirm(`¿Crear la nota de pedido de la conversación ${c.telefono}?`)) return;
    setBusy(c.id);
    setError("");
    try {
      const r = await api.crearPedidoWhatsapp(c.id);
      setNotice(`Pedido creado (${r.documento.tipo} ${r.documento.estado}). Lo factura un empleado desde Notas de pedido.`);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  }

  async function marcarEnviada(n: any) {
    try {
      await api.marcarNotificacionEnviada(n.id);
      await load();
    } catch (e: any) { setError(e.message); }
  }

  const REPARTO: Record<string, string> = { PREPARANDO: "Preparando", LISTO: "Listo para retirar", EN_CAMINO: "En camino", ENTREGADO: "Entregado" };

  const resumen = (cmd: any) => {
    if (!cmd) return "Sin comando todavía";
    const prods = (cmd.products || []).map((p: any) => `${p.cantidad} ${p.descripcion || p.codigo}`).join(" + ");
    return `${cmd.operation || "?"} · Cliente: ${cmd.customer?.text || "—"}${prods ? ` · ${prods}` : ""}`;
  };

  return <div className="products-page">
    <div className="products-toolbar">
      <div><h3>Bandeja de WhatsApp (fase 2)</h3><p>Conversaciones activas: tomá la conversación, enviá respuestas rápidas, creá el pedido o notificá el estado. El pedido se factura desde Notas de pedido.</p></div>
      <button onClick={load}>Actualizar</button>
    </div>
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}
    <div className="products-card">
      <table>
        <thead><tr><th>Teléfono</th><th>Contacto</th><th>Estado</th><th>Última interacción</th><th>Comando</th><th></th></tr></thead>
        <tbody>{convs.map(c => <tr key={c.id}>
          <td><Phone size={14} /> <strong>{c.telefono}</strong></td>
          <td>{c.whatsappNombre || c.clienteNombre || "—"}</td>
          <td>{c.estado}{c.moderador && <span className="badge warning">Tomada</span>}</td>
          <td><Clock size={13} /> {fmtFechaHora(c.updatedAt)}{(Date.now() - new Date(c.updatedAt).getTime()) > 86400000 && <span className="badge warning wa-24h" title="Pasaron más de 24 h desde el último mensaje: se necesita plantilla aprobada para retomar">24h+</span>}</td>
          <td>
            <button onClick={() => setExpanded(expanded === c.id ? null : c.id)}>{expanded === c.id ? "−" : "+"}</button>
            {expanded === c.id
              ? <div className="wa-comando">{resumen(c.command)}</div>
              : <span className="wa-resumen">{resumen(c.command).slice(0, 60)}…</span>}
          </td>
          <td className="row-actions">
            {!c.moderador && <button title="Tomar conversación" disabled={busy === c.id} onClick={() => tomar(c, true)}><UserRound size={15} /> Tomar</button>}
            {c.moderador && <button title="Devolver al bot" disabled={busy === c.id} onClick={() => tomar(c, false)}><RotateCcw size={15} /> Devolver</button>}
            <button title="Crear la nota de pedido de la conversación" disabled={busy === c.id || !c.command} onClick={() => crearPedido(c)}><PackagePlus size={15} /> Crear pedido</button>
          </td>
        </tr>)}
        </tbody>
      </table>
      {!convs.length && <div className="empty-table">No hay conversaciones de WhatsApp todavía.</div>}
    </div>

    <div className="products-card wa-tray-cards">
      <h3><Send size={16} /> Respuestas rápidas</h3>
      <p className="wa-ayuda">Elegí una conversación (columna Teléfono) y enviá una respuesta rápida como el bot:</p>
      <div className="wa-rapidas">{convs.map(c => <div className="wa-rapida-row" key={c.id}>
        <span className="wa-tel">{c.telefono} ({c.estado})</span>
        <div className="wa-rapida-btns">{RAPIDAS.map(t => <button key={t} disabled={busy === c.id} onClick={() => enviarRapida(c, t)}>{t.slice(0, 30)}…</button>)}</div>
        {respBot[c.id] && <small className="wa-respuesta">{respBot[c.id]}</small>}
      </div>)}
      {!convs.length && <div className="empty-table">Sin conversaciones.</div>}
      </div>
    </div>

    <div className="products-card wa-tray-cards">
      <h3><Bell size={16} /> Notificaciones de estado del pedido</h3>
      <p className="wa-ayuda">Se generan al crear el pedido y cuando cambia su estado. Cuando conectes la API oficial de WhatsApp se envían solas; acá las ves para enviarlas o marcarlas.</p>
      <table>
        <thead><tr><th>Fecha</th><th>Teléfono</th><th>Pedido</th><th>Mensaje</th><th>Estado</th><th></th></tr></thead>
        <tbody>{notis.map(n => <tr key={n.id}>
          <td>{fmtFechaHora(n.created_at)}</td>
          <td>{n.telefono}</td>
          <td>{n.pedido_numero ? `N° ${n.pedido_numero}` : "—"}</td>
          <td>{n.mensaje}</td>
          <td>{n.estado}</td>
          <td className="row-actions">{n.estado_pedido === "AUDIO" && <span className="badge warning">AUDIO</span>}{n.estado_pedido === "PAGO_PENDIENTE_VERIFICACION" && <span className="badge danger">PAGO A VERIFICAR</span>}{n.pedido_id && <button title="Generar y ver el PDF del pedido" onClick={() => api.generarDocumentoPdf(n.pedido_id).catch((e:any) => setError(e.message))}>Ver PDF</button>}{n.estado === "PENDIENTE" && n.estado_pedido !== "AUDIO" && n.estado_pedido !== "PAGO_PENDIENTE_VERIFICACION" && <button onClick={() => enviarNoti(n)}>Enviar por WhatsApp</button>}{n.estado === "PENDIENTE" && <button onClick={() => marcarEnviada(n)}><Check size={14} /> Marcar enviada</button>}{n.estado === "PENDIENTE" && n.estado_pedido === "PAGO_PENDIENTE_VERIFICACION" && <button onClick={() => verificarPagoN(n.id)}>Verificar pago</button>}</td>
        </tr>)}
        {!notis.length && <tr><td colSpan={6} className="empty-table">No hay notificaciones.</td></tr>}
        </tbody>
      </table>
    </div>

    <div className="products-card wa-tray-cards">
      <h3><PackagePlus size={16} /> Pedidos de WhatsApp — reparto y pago</h3>
      <p className="wa-ayuda">Los pedidos creados desde WhatsApp (los factura un empleado desde Notas de pedido). Avanzá el estado de reparto para avisarle al cliente; cada cambio genera la notificación.</p>
      <table>
        <thead><tr><th>N°</th><th>Fecha</th><th>Total</th><th>Reparto</th><th></th></tr></thead>
        <tbody>{pedidos.map(pd => <tr key={pd.id}>
          <td><strong>{String(pd.punto_venta).padStart(4, "0")}-{String(pd.numero).padStart(8, "0")}</strong></td>
          <td>{fmtFechaHora(pd.fecha || pd.created_at)}</td>
          <td className="price">$ {Number(pd.importe_total || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
          <td>{REPARTO[pd.estado_reparto] || pd.estado_reparto || "—"}</td>
          <td className="row-actions">
            <select value={pd.estado_reparto || "PREPARANDO"} onChange={e => reparto(pd.id, e.target.value)}>
              <option value="PREPARANDO">Preparando</option>
              <option value="LISTO">Listo</option>
              <option value="EN_CAMINO">En camino</option>
              <option value="ENTREGADO">Entregado</option>
            </select>
            <button title="Enviar el link de pago de Mercado Pago al cliente" onClick={() => enviarPago(pd.id)}>Link de pago</button>
            <button title="Ver el PDF del pedido" onClick={() => api.generarDocumentoPdf(pd.id).catch((e:any) => setError(e.message))}>PDF</button>
          </td>
        </tr>)}
        {!pedidos.length && <tr><td colSpan={5} className="empty-table">Todavía no hay pedidos de WhatsApp.</td></tr>}
        </tbody>
      </table>
    </div>

    <div className="products-card wa-tray-cards">
      <h3><Phone size={16} /> Conexión WhatsApp Cloud (Meta)</h3>
      <p className="wa-ayuda">Completá los datos de la API oficial de Meta y el sistema envía y recibe mensajes reales. Webhook para configurar en Meta: <code>{window.location.origin}/api/v1/whatsapp/webhook</code></p>
      {cfgMsg && <div className="success-box">{cfgMsg}</div>}
      <div className="form-grid">
        <label className="full">Token de acceso (Meta)<input type="password" value={cfg.token} onChange={e => setCfg({ ...cfg, token: e.target.value })} placeholder="EAA... token permanente de la app" /></label>
        <label>Phone number ID<input value={cfg.phoneId} onChange={e => setCfg({ ...cfg, phoneId: e.target.value })} placeholder="123456789012345" /></label>
        <label>Número de WhatsApp de la empresa<input value={cfg.numero} onChange={e => setCfg({ ...cfg, numero: e.target.value })} placeholder="5493412345678" /></label>
        <label className="full">Token de verificación del webhook<input value={cfg.verifyToken} onChange={e => setCfg({ ...cfg, verifyToken: e.target.value })} placeholder="Cualquier texto secreto" /></label>
      </div>
      <div className="modal-actions">
        <label className="toggle-row"><div><strong>Activo</strong></div><input type="checkbox" checked={cfg.activo} onChange={e => setCfg({ ...cfg, activo: e.target.checked })} /></label>
        <button className="secondary-action" onClick={guardarCfg}>Guardar conexión</button>
        <button className="primary-action" onClick={probarCfg}>Probar conexión</button>
      </div>
    </div>

    <div className="info-note"><Check size={16}/> Fase 2: respuestas rápidas y avisos de estado. Próximas fases: plantillas 24 h, audios e IA, pagos y seguimiento de reparto.</div>
  </div>;
}