import { useEffect, useState } from "react";
import { Search, Save } from "lucide-react";
import { useServerRows } from "../../hooks/useServerStorage";
import { erpApi } from "../../services/api";

/*
 * Cartera manual de clientes por vendedor: el administrador elige el
 * vendedor y marca qué clientes puede visitar y tomar pedidos.
 */
export function VendorClientsPage() {
  const [sellers] = useServerRows("afip_sellers_v31", []);
  const [vendedorId, setVendedorId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [clientes, setClientes] = useState<any[]>([]);
  const [asignados, setAsignados] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const activos = sellers.filter((s: any) => s.activo !== false);

  async function cargar(v: number, texto = q) {
    setError("");
    try {
      const r = await erpApi.listVendedorClientes(v, texto);
      setClientes(r.clientes || []);
      setAsignados(new Set((r.asignadosIds || []).map(Number)));
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    if (vendedorId) cargar(vendedorId);
  }, [vendedorId]);

  async function guardar() {
    if (!vendedorId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await erpApi.saveVendedorClientes(vendedorId, Array.from(asignados));
      setNotice(`Cartera guardada: ${r.asignados} clientes asignados.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: number) {
    const next = new Set(asignados);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAsignados(next);
  }

  return <div className="products-page">
    <div className="products-toolbar">
      <div><h3>Cartera de clientes por vendedor</h3><p>El vendedor solo verá los clientes que le marques acá (lista manual).</p></div>
      {vendedorId && <button className="primary-action" disabled={busy} onClick={guardar}><Save size={16}/> {busy ? "Guardando..." : "Guardar cartera"}</button>}
    </div>
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}
    <div className="products-card">
      <div className="report-filters">
        <label>Vendedor<select value={vendedorId || ""} onChange={e => setVendedorId(Number(e.target.value) || null)}><option value="">Seleccionar vendedor...</option>{activos.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
        <label>Buscar cliente<input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && vendedorId && cargar(vendedorId)} placeholder="Nombre, CUIT o dirección..." /></label>
        <button className="secondary-action" disabled={!vendedorId} onClick={() => vendedorId && cargar(vendedorId)}><Search size={16}/> Buscar</button>
      </div>
      {vendedorId ? <table>
        <thead><tr><th></th><th>Cliente</th><th>CUIT</th><th>Domicilio</th><th>Localidad</th><th>Pedidos</th></tr></thead>
        <tbody>{clientes.map((c: any) => <tr key={c.id}>
          <td><input type="checkbox" checked={asignados.has(Number(c.id))} onChange={() => toggle(Number(c.id))} /></td>
          <td><strong>{c.razon_social}</strong></td>
          <td>{c.cuit || "-"}</td>
          <td>{c.domicilio || "-"}</td>
          <td>{c.localidad || "-"}</td>
          <td>{c.cliente_pedidos ? <span className="badge success">SÍ</span> : <span className="badge">NO</span>}</td>
        </tr>)}</tbody>
      </table> : <div className="empty-table">Elegí un vendedor para ver y marcar sus clientes.</div>}
      {vendedorId && !clientes.length && <div className="empty-table">No hay clientes que coincidan con la búsqueda.</div>}
    </div>
  </div>;
}
