import { useEffect, useState } from "react";
import { Check, MapPin, RefreshCw, Search, Truck, X } from "lucide-react";
import { erpApi } from "../../services/api";
import { useServerRows } from "../../hooks/useServerStorage";

/*
 * Bandeja de pedidos del administrador (Etapa 3).
 *
 * Lista los pedidos tomados por los vendedores, permite revisarlos,
 * quitar productos o ajustar cantidades, confirmar total/parcial,
 * rechazarlos y avanzar el estado (preparando, despachado, entregado)
 * dejando todo el historial de trazabilidad.
 */

const ESTADOS = ["PENDIENTE", "REVISANDO", "CONFIRMADO", "PARCIAL", "RECHAZADO", "PREPARANDO", "DESPACHADO", "ENTREGADO"];

function claseEstado(estado: string) {
  const e = String(estado || "PENDIENTE").toUpperCase();
  if (e === "PENDIENTE") return "badge warning";
  if (e === "PARCIAL") return "badge warning";
  if (e === "RECHAZADO") return "badge danger";
  if (e === "CONFIRMADO") return "badge success";
  if (e === "ENTREGADO") return "badge success";
  return "badge";
}

export function MobileOrdersAdminPage() {
  const [sellers] = useServerRows("afip_sellers_v31", []);
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [resumen, setResumen] = useState<any[]>([]);
  const [estado, setEstado] = useState("PENDIENTE");
  const [vendedorId, setVendedorId] = useState<number | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [detalle, setDetalle] = useState<any>(null);
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [noDisponibles, setNoDisponibles] = useState<Set<number>>(new Set());
  const [detalleTexto, setDetalleTexto] = useState("");

  async function cargar() {
    setError("");
    try {
      const r = await erpApi.listBandejaPedidos({
        estado: estado || undefined,
        vendedor_id: vendedorId || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
        q: q || undefined,
      });
      setPedidos(r.pedidos || []);
      setResumen(r.resumen || []);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
  }, [estado, vendedorId]);

  async function abrir(id: number) {
    setError("");
    try {
      const r = await erpApi.getPedidoMovil(id);
      setDetalle(r);
      const iniciales: Record<number, number> = {};
      for (const item of r.items || []) iniciales[item.id] = Number(item.cantidad);
      setCantidades(iniciales);
      setNoDisponibles(new Set());
      setDetalleTexto("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  function marcarNoDisponible(item: any) {
    const next = new Set(noDisponibles);
    if (next.has(item.id)) {
      next.delete(item.id);
      setCantidades({ ...cantidades, [item.id]: Number(item.cantidad) });
    } else {
      next.add(item.id);
      setCantidades({ ...cantidades, [item.id]: 0 });
    }
    setNoDisponibles(next);
  }

  async function revisar(nuevoEstado: string) {
    if (!detalle) return;
    if (nuevoEstado === "RECHAZADO" && !confirm("¿Rechazar el pedido? Se anula y no pasa a preparación.")) return;
    setBusy(true);
    setError("");
    try {
      await erpApi.revisarPedidoMovil(detalle.pedido.id, {
        estado: nuevoEstado,
        items: detalle.items.map((i: any) => ({ venta_item_id: i.id, cantidad: Number(cantidades[i.id] ?? i.cantidad) })),
        detalle: detalleTexto,
      });
      setNotice(`Pedido ${nuevoEstado === "CONFIRMADO" ? "confirmado" : nuevoEstado === "PARCIAL" ? "confirmado parcialmente" : "rechazado"}.`);
      setDetalle(null);
      await cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function avanzar(nuevoEstado: string) {
    if (!detalle) return;
    setBusy(true);
    setError("");
    try {
      await erpApi.cambiarEstadoPedidoMovil(detalle.pedido.id, nuevoEstado, detalleTexto);
      setNotice(`Pedido en estado ${nuevoEstado}.`);
      await abrir(detalle.pedido.id);
      await cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const yaRevisado = detalle && ["CONFIRMADO", "PARCIAL", "RECHAZADO"].includes(String(detalle.pedido.estado_pedido || "PENDIENTE").toUpperCase());

  return <div className="products-page">
    <div className="products-toolbar">
      <div><h3>Bandeja de pedidos</h3><p>Pedidos tomados por los vendedores: revisá, ajustá y confirmá antes de preparar.</p></div>
      <button className="secondary-action" onClick={cargar}><RefreshCw size={16} /> Actualizar</button>
    </div>
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}

    <div className="report-filters">
      <label>Estado<select value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos</option>{ESTADOS.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
      <label>Vendedor<select value={vendedorId || ""} onChange={(e) => setVendedorId(Number(e.target.value) || null)}><option value="">Todos</option>{sellers.filter((s: any) => s.activo !== false).map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
      <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
      <label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
      <label>Buscar<input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && cargar()} placeholder="Cliente, vendedor o número" /></label>
      <button className="secondary-action" onClick={cargar}><Search size={16} /> Buscar</button>
    </div>

    <div className="orders-resumen">
      {resumen.map((r: any) => <button key={r.estado} className={estado === r.estado ? "activo" : ""} onClick={() => setEstado(estado === r.estado ? "" : r.estado)}>
        <span>{r.estado}</span><b>{r.n}</b>
      </button>)}
    </div>

    <div className="products-card"><table>
      <thead><tr><th>Fecha</th><th>Vendedor</th><th>Cliente</th><th>Ubicación</th><th>Total</th><th>Estado</th><th></th></tr></thead>
      <tbody>{pedidos.map((p: any) => <tr key={p.id}>
        <td>{String(p.fecha || "").slice(0, 10)}<small>{p.hora_visita || ""}</small></td>
        <td>{p.vendedor || "-"}</td>
        <td><strong>{p.cliente || "CONSUMIDOR FINAL"}</strong><small>{p.tipo === "PRESUPUESTO" ? "Presupuesto" : "Nota de pedido"} {String(p.punto_venta || "").padStart(4, "0")}-{String(p.numero || "").padStart(8, "0")}</small></td>
        <td>{p.latitud != null && p.longitud != null ? <a className="link-button" href={`https://www.google.com/maps?q=${p.latitud},${p.longitud}`} target="_blank" rel="noreferrer"><MapPin size={14} /> Ver mapa</a> : "—"}</td>
        <td className="price">$ {Number(p.total || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
        <td><span className={claseEstado(p.estado_pedido)}>{p.estado_pedido || "PENDIENTE"}</span></td>
        <td><button className="secondary-action" onClick={() => abrir(p.id)}>Abrir</button></td>
      </tr>)}</tbody>
    </table>
    {!pedidos.length && <div className="empty-table">No hay pedidos con esos filtros.</div>}
    </div>

    {detalle && <div className="modal-backdrop"><div className="modal polished-modal order-review-modal">
      <div className="modal-head">
        <div>
          <h3>Pedido #{String(detalle.pedido.numero || "").padStart(6, "0")} · {detalle.pedido.cliente || "CONSUMIDOR FINAL"}</h3>
          <p>Vendedor: <strong>{detalle.pedido.vendedor || "-"}</strong> · {String(detalle.pedido.fecha || "").slice(0, 10)} {detalle.pedido.hora_visita || ""} {detalle.pedido.canal ? `· Canal ${detalle.pedido.canal}` : ""}</p>
          {detalle.pedido.latitud != null && <p><a className="link-button" href={`https://www.google.com/maps?q=${detalle.pedido.latitud},${detalle.pedido.longitud}`} target="_blank" rel="noreferrer"><MapPin size={14} /> Ubicación registrada</a></p>}
        </div>
        <button onClick={() => setDetalle(null)}><X /></button>
      </div>

      <table className="order-review-items"><thead><tr><th>Código</th><th>Producto</th><th>Pedido</th><th>Precio</th><th>Cantidad final</th><th></th></tr></thead>
        <tbody>{detalle.items.map((i: any) => <tr key={i.id} className={noDisponibles.has(i.id) ? "no-disponible" : ""}>
          <td>{i.codigo}</td>
          <td>{i.descripcion}</td>
          <td>{Number(i.cantidad).toLocaleString("es-AR")}</td>
          <td className="price">$ {Number(i.precio_unitario || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
          <td><input type="number" min={0} value={cantidades[i.id] ?? Number(i.cantidad)} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setCantidades({ ...cantidades, [i.id]: Math.max(0, Number(e.target.value) || 0) })} disabled={yaRevisado || noDisponibles.has(i.id)} /></td>
          <td>{!yaRevisado && <button className={noDisponibles.has(i.id) ? "secondary-action" : "link-button"} onClick={() => marcarNoDisponible(i)}>{noDisponibles.has(i.id) ? "Restituir" : "No disponible"}</button>}</td>
        </tr>)}</tbody>
      </table>

      {!yaRevisado && <>
        <label className="full">Observación de la revisión<input value={detalleTexto} onChange={(e) => setDetalleTexto(e.target.value)} placeholder="Ej.: faltaba stock de un producto" /></label>
        <div className="modal-actions">
          <button className="danger-action" disabled={busy} onClick={() => revisar("RECHAZADO")}>Rechazar</button>
          <button disabled={busy} onClick={() => revisar("PARCIAL")}>Dejar parcial</button>
          <button className="primary-action" disabled={busy} onClick={() => revisar("CONFIRMADO")}><Check size={16} /> Confirmar pedido</button>
        </div>
      </>}

      {yaRevisado && detalle.pedido.estado_pedido !== "RECHAZADO" && <div className="modal-actions">
        {["PREPARANDO", "DESPACHADO", "ENTREGADO"].map((x) => <button key={x} disabled={busy || detalle.pedido.estado_pedido === x} onClick={() => avanzar(x)}><Truck size={15} /> {x}</button>)}
      </div>}

      <div className="order-historial">
        <h4>Trazabilidad</h4>
        {detalle.historial.map((h: any) => <div key={h.id} className="order-historial-linea">
          <span>{String(h.created_at || "").slice(0, 16)}</span>
          <strong>{h.usuario_nombre || "SISTEMA"}</strong>
          <em className={claseEstado(h.estado)}>{h.estado}</em>
          {h.detalle && <small>{h.detalle}</small>}
        </div>)}
        {!detalle.historial.length && <div className="empty-table">Sin movimientos.</div>}
      </div>
    </div></div>}
  </div>;
}
