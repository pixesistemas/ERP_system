import { Fragment, useState, useEffect } from "react";
import { api, erpApi } from "../../services/api";
import { fmtFechaHora } from "../../utils/fecha";

export function SalesHistoryPage() {
  const [sales, setSales] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [obsOpen, setObsOpen] = useState<number | null>(null);

  async function load() {
    try {
      setError("");
      const r:any = await erpApi.listPosOperations();
      setSales(r.operations || []);
    } catch (e:any) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function retry(id:number) {
    setBusy(id);
    try {
      await erpApi.posRetryFiscal(id);
      await load();
    } catch (e:any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  function observacionesArca(s:any) {
    if (!s.afip_observaciones) return null;
    try {
      const parsed = typeof s.afip_observaciones === "string" ? JSON.parse(s.afip_observaciones) : s.afip_observaciones;
      const obs = Array.isArray(parsed?.Obs) ? parsed.Obs : Array.isArray(parsed) ? parsed : [];
      if (!obs.length) return null;
      return obs;
    } catch {
      return null;
    }
  }

  function estadoFiscal(s:any) {
    const estado = s.afip_estado;
    if (!estado) return s.estado || (s.cae ? "AUTORIZADO" : "DEMO");
    return estado;
  }

  function claseFiscal(s:any) {
    const estado = s.afip_estado;
    if (estado === "AUTORIZADO") return "fiscal-ok";
    if (estado === "PENDIENTE") return "fiscal-warn";
    if (estado === "RECHAZADO") return "fiscal-bad";
    return "";
  }

  const numeroFiscal = (s:any) =>
    s.cae
      ? `${s.comprobante_letra || s.tipo || ""} ${String(s.punto_venta||'').padStart(5,"0")}-${String(s.numero||'').padStart(8,"0")}`
      : `${s.tipo === "REMITO" ? `REMITO ${s.subtipo || "X"}` : s.tipo || "FACTURA"} ${String(s.punto_venta || s.pv || "").padStart(4,"0")}-${s.numero || ""}`;

  return <div className="products-page">
    <div className="products-toolbar"><div><h3>Historial de ventas</h3><p>Ventas del POS con estado fiscal ARCA.</p></div><button className="primary-action" onClick={load}>Actualizar</button></div>
    {error && <div className="error-box">{error}</div>}
    <div className="products-card"><table><thead><tr><th>Fecha</th><th>Comprobante</th><th>Cliente</th><th>Estado fiscal</th><th>CAE</th><th>Total</th><th></th></tr></thead><tbody>{sales.map((s:any)=><Fragment key={s.id}><tr><td>{fmtFechaHora(s.created_at || s.fecha)}</td><td><strong>{numeroFiscal(s)}</strong></td><td>{s.cliente || s.razon_social || s.cliente_nombre ? (s.cliente || s.razon_social || s.cliente_nombre) : 'CONSUMIDOR FINAL'}</td><td><span className={claseFiscal(s)}>{estadoFiscal(s)}</span></td><td>{s.cae || '-'}</td><td className="price">$ {Number(s.total || s.importe_total || 0).toLocaleString('es-AR',{minimumFractionDigits:2})}</td><td className="row-actions">{s.afip_estado==='PENDIENTE'&&<button disabled={busy===s.id} onClick={()=>retry(s.id)}>Reintentar CAE</button>}<button onClick={()=>setObsOpen(obsOpen===s.id?null:s.id)}>Ver observación</button></td></tr>{obsOpen===s.id&&<tr className="obs-row"><td colSpan={7}><strong>Observación:</strong> {s.observaciones || 'Sin observación.'}{(()=>{const arca=observacionesArca(s);if(!arca)return null;return <><div className="obs-arca"><strong>Respuesta de ARCA:</strong>{arca.map((o:any,i:number)=><div className="obs-arca-line" key={i}><b>Obs {o.Code}</b><span>{o.Msg}</span></div>)}</div></>})()}</td></tr>}</Fragment>)}</tbody></table>{!sales.length&&<div className="empty-table">Todavía no hay ventas registradas.</div>}</div>
  </div>;
}
