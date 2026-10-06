import { useEffect, useState } from "react";
import { Check, RefreshCw, Undo2 } from "lucide-react";
import { erpApi } from "../../services/api";
import { useServerRows } from "../../hooks/useServerStorage";
import { fmtFecha } from "../../utils/fecha";

/*
 * Devoluciones de reparto: acá el administrador ve todo lo que los
 * repartidores marcaron como devuelto, ajusta la cantidad y lo confirma.
 * Al confirmar, el producto descuenta en negativo en los reportes de
 * vendedores y queda con su fecha de devolución.
 */
export function DeliveryReturnsPage() {
  const [estado, setEstado] = useState("PENDIENTE");
  const [devoluciones, setDevoluciones] = useState<any[]>([]);
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [sellers] = useServerRows("afip_sellers_v31", []);

  async function cargar(est = estado) {
    setError("");
    try {
      const r = await erpApi.listRepartoDevoluciones(est);
      const lista = r.devoluciones || [];
      setDevoluciones(lista);
      setCantidades(Object.fromEntries(lista.map((d: any) => [d.id, Number(d.cantidad)])));
      setSeleccion(new Set());
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar(estado);
  }, [estado]);

  function toggle(id: number) {
    const next = new Set(seleccion);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSeleccion(next);
  }

  async function confirmar(ids: number[]) {
    if (!ids.length) return setError("Seleccioná al menos una devolución.");
    if (!confirm(`¿Confirmar ${ids.length} devolución(es)? A partir de ahí descuentan en los reportes.`)) return;
    setBusy(true);
    setError("");
    try {
      const r = await erpApi.confirmarDevolucion(ids, cantidades);
      setNotice(`${r.confirmadas} devolución(es) confirmadas.`);
      await cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="products-page">
    <div className="products-toolbar">
      <div><h3>Devoluciones de reparto</h3><p>Productos que los clientes devolvieron en la entrega. Ajustá la cantidad y confirmá para que descuenten en los reportes.</p></div>
      <div className="inline-actions">
        <select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="PENDIENTE">Pendientes</option>
          <option value="CONFIRMADA">Confirmadas</option>
          <option value="TODAS">Todas</option>
        </select>
        <button className="secondary-action" onClick={() => cargar()}><RefreshCw size={16} /> Actualizar</button>
        {seleccion.size > 0 && <button className="primary-action" disabled={busy} onClick={() => confirmar(Array.from(seleccion))}><Check size={16} /> Confirmar seleccionadas ({seleccion.size})</button>}
      </div>
    </div>
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}

    <div className="products-card">
      <table>
        <thead><tr><th></th><th>Fecha dev.</th><th>Ruta</th><th>Cliente</th><th>Vendedor</th><th>Producto</th><th>Cantidad</th><th>Estado</th><th></th></tr></thead>
        <tbody>{devoluciones.map((d: any) => <tr key={d.id}>
          <td>{!d.confirmado && <input type="checkbox" checked={seleccion.has(d.id)} onChange={() => toggle(d.id)} />}</td>
          <td>{fmtFecha(d.fecha)}<small>{d.hora || ""}</small></td>
          <td>{d.ruta_numero || `#${d.ruta_id}`}</td>
          <td><strong>{d.cliente || "CONSUMIDOR FINAL"}</strong><small>Pedido {String(d.venta_punto_venta || "").padStart(4, "0")}-{String(d.venta_numero || "").padStart(8, "0")}</small></td>
          <td>{d.vendedor || sellers.find((s: any) => Number(s.id) === Number(d.vendedor_id))?.nombre || "-"}</td>
          <td>{d.descripcion || d.codigo}</td>
          <td>{d.confirmado
            ? <b style={{ color: "#B23B58" }}>−{Number(d.cantidad).toLocaleString("es-AR")}</b>
            : <input type="text" inputMode="decimal" value={cantidades[d.id] ?? Number(d.cantidad)} onFocus={(e) => e.currentTarget.select()} onChange={(e) => { const limpio = String(e.target.value).replace(/[^\d.,]/g, "").replace(",", "."); setCantidades({ ...cantidades, [d.id]: Math.max(0, Number(limpio) || 0) }); }} style={{ width: 80, textAlign: "center" }} />}</td>
          <td>{d.confirmado ? <span className="badge success">CONFIRMADA</span> : <span className="badge warning">PENDIENTE</span>}</td>
          <td>{!d.confirmado && <button className="secondary-action" disabled={busy} onClick={() => confirmar([d.id])}><Undo2 size={15} /> Confirmar</button>}</td>
        </tr>)}</tbody>
      </table>
      {!devoluciones.length && <div className="empty-table">No hay devoluciones {estado === "PENDIENTE" ? "pendientes" : ""}.</div>}
    </div>
  </div>;
}
