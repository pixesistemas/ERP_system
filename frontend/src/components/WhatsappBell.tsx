import { useState, useEffect } from "react";
import { Bell, Phone, BellRing, BadgeCheck } from "lucide-react";
import { api } from "../services/api";

/*
 * Campanita flotante de notificaciones: avisa cuando entran solicitudes de
 * clientes para Pedidos por WhatsApp o notificaciones de estado en la
 * Bandeja (pedidos, audios, pagos a verificar). Consulta cada 25 segundos.
 */
export function WhatsappBell({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [resumen, setResumen] = useState<any>({ solicitudes: 0, notificaciones: 0, audios: 0, pagos: 0, total: 0 });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function refrescar() {
    try {
      const r = await api.whatsappResumenNotificaciones();
      setResumen(r || { solicitudes: 0, notificaciones: 0, audios: 0, pagos: 0, total: 0 });
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    refrescar();
    const timer = setInterval(refrescar, 25000);
    return () => clearInterval(timer);
  }, []);

  const nuevos = Number(resumen.pedidosNuevos || 0);
  const items: { icon: any; texto: string; page: string; color: string }[] = [];
  if (nuevos > 0) items.push({ icon: Phone, texto: `${nuevos} pedido/s nuevo/s por atender`, page: "whatsapp-tray", color: "" });
  if (Number(resumen.solicitudes) > 0) items.push({ icon: Phone, texto: `${resumen.solicitudes} solicitud/es de clientes por aprobar`, page: "whatsapp-orders", color: "" });
  if (Number(resumen.audios) > 0) items.push({ icon: BellRing, texto: `${resumen.audios} audio/s recibidos para revisar`, page: "whatsapp-tray", color: "" });
  if (Number(resumen.pagos) > 0) items.push({ icon: BadgeCheck, texto: `${resumen.pagos} pago/s a verificar`, page: "whatsapp-tray", color: "" });
  if (Number(resumen.notificaciones) > 0) items.push({ icon: Bell, texto: `${resumen.notificaciones} notificaciones pendientes de enviar`, page: "whatsapp-tray", color: "" });

  return <div className="wa-bell">
    <button className={`wa-bell-btn${nuevos > 0 ? " has-news" : ""}`} onClick={() => { setOpen(!open); refrescar(); }} title={nuevos > 0 ? "Hay pedidos nuevos por atender" : "Notificaciones entrantes"}>
      <Bell size={19} />
      {nuevos > 0 && <b>{nuevos > 99 ? "99+" : nuevos}</b>}
    </button>
    {open && <div className="wa-bell-panel">
      <div className="wa-bell-head"><strong>Notificaciones entrantes</strong><button onClick={() => setOpen(false)}>×</button></div>
      {error && <p className="wa-bell-err">{error}</p>}
      {!items.length ? <p className="wa-bell-empty">No hay novedades por ahora.</p> : items.map((it, i) => <button key={i} className="wa-bell-item" onClick={() => { setOpen(false); onNavigate(it.page); }}>
        <it.icon size={15} /><span>{it.texto}</span><b>Ver</b>
      </button>)}
      <div className="wa-bell-foot">Se actualiza solo cada 25 segundos</div>
    </div>}
  </div>;
}
