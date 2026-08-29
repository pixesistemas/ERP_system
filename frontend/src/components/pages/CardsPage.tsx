import { useEffect, useMemo, useState } from "react";
import { fmtFecha } from "../../utils/fecha";
import { erpApi } from "../../services/api";

const PRESETS = [
  { key: "todo", label: "Todo el período" },
  { key: "hoy", label: "Hoy" },
  { key: "7", label: "Últimos 7 días" },
  { key: "30", label: "Últimos 30 días" },
  { key: "90", label: "Últimos 90 días" },
];

export function CardsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState("todo");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    erpApi.listCardCollections()
      .then((r: any) => setRows(r.cobros || []))
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const filtered = useMemo(() => {
    let list = rows;
    const hoy = new Date();
    const start = new Date();
    if (preset === "hoy") start.setHours(0, 0, 0, 0);
    else if (preset === "7") start.setDate(hoy.getDate() - 7);
    else if (preset === "30") start.setDate(hoy.getDate() - 30);
    else if (preset === "90") start.setDate(hoy.getDate() - 90);
    const desdeMs = preset === "todo" && desde ? new Date(desde).getTime() : preset === "todo" ? null : start.getTime();
    const hastaMs = preset === "todo" && hasta ? new Date(hasta + "T23:59:59").getTime() : preset === "todo" ? null : hoy.getTime();
    if (desdeMs !== null) list = list.filter((r) => new Date(r.fecha).getTime() >= desdeMs!);
    if (hastaMs !== null) list = list.filter((r) => new Date(r.fecha).getTime() <= hastaMs!);
    if (estado) list = list.filter((r) => String(r.estado).toUpperCase() === estado);
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter((r) => `${r.comprobante} ${r.cliente} ${r.tarjeta} ${r.cupon || ""} ${r.autorizacion || ""}`.toLowerCase().includes(needle));
    }
    return list;
  }, [rows, preset, desde, hasta, estado, q]);
  const total = filtered.reduce((n, r) => n + Number(r.importe || 0), 0);
  const totalGeneral = rows.reduce((n, r) => n + Number(r.importe || 0), 0);
  return <div className="products-page"><div className="products-toolbar"><div><h3>Cobros con tarjetas</h3><p>Cupones asociados a ventas del POS y recibos de cobro con tarjeta.</p></div><div className="filter-row">
    <select value={preset} onChange={(e) => setPreset(e.target.value)}>
      {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
    </select>
    {preset === "todo" && <>
      <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
      <span className="filter-sep">→</span>
      <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
    </>}
    <select value={estado} onChange={(e) => setEstado(e.target.value)}>
      <option value="">Todos los estados</option>
      <option value="CONFIRMADO">CONFIRMADO</option>
      <option value="PENDIENTE">PENDIENTE</option>
      <option value="ANULADO">ANULADO</option>
    </select>
    <div className="search-box"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar comprobante, cliente, cupón..." /></div>
  </div></div>{error && <div className="error-box">{error}</div>}<div className="products-card"><table><thead><tr><th>Fecha</th><th>Tarjeta</th><th>Comprobante</th><th>Cliente</th><th>Cuotas</th><th>Lote</th><th>Cupón</th><th>Autorización</th><th>Importe</th><th>Estado</th></tr></thead><tbody>{filtered.map((r: any) => <tr key={r.id}><td>{fmtFecha(r.fecha)}</td><td>{r.tarjeta}</td><td><strong>{r.comprobante}</strong></td><td>{r.cliente}</td><td>{r.cuotas || "—"}</td><td>{r.lote || "—"}</td><td>{r.cupon || "—"}</td><td>{r.autorizacion || "—"}</td><td className="price">$ {Number(r.importe).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td><td><span className={String(r.estado).toUpperCase() === 'CONFIRMADO' ? 'badge success' : 'badge'}>{r.estado}</span></td></tr>)}</tbody></table>{!loading && !filtered.length && <div className="empty-table">No hay cobros con tarjeta que coincidan con los filtros.</div>}</div>{filtered.length > 0 && <div className="report-total">Total filtrado: <strong>$ {total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>{filtered.length !== rows.length && <span className="report-sub"> · Total general: $ {totalGeneral.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>}</div>}</div>;
}