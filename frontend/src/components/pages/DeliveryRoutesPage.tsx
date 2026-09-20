import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, MapPin, Printer, RefreshCw, Truck, X } from "lucide-react";
import { api, erpApi } from "../../services/api";

/*
 * Reparto (Etapa 4): armado de rutas con pedidos confirmados (manual o
 * sugerida por zona), hoja de ruta ordenable, carga del vehículo,
 * cierre de ruta e impresión.
 */
export function DeliveryRoutesPage() {
  const [vista, setVista] = useState<"ARMAR" | "RUTAS">("ARMAR");
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [rutas, setRutas] = useState<any[]>([]);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [repartidores, setRepartidores] = useState<any[]>([]);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [repartidorId, setRepartidorId] = useState<number | null>(null);
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [observaciones, setObservaciones] = useState("");
  const [detalle, setDetalle] = useState<any>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function cargar() {
    setError("");
    try {
      const [p, r] = await Promise.all([erpApi.listPedidosParaRuta(), erpApi.listRutasReparto()]);
      setPedidos(p.pedidos || []);
      setRutas(r.rutas || []);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
    api.listUsers().then((u: any) => setRepartidores(u.usuarios || [])).catch(() => {});
  }, []);

  function toggle(id: number) {
    const next = new Set(seleccion);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSeleccion(next);
  }

  async function crear(orden: "MANUAL" | "ZONA") {
    if (!seleccion.size) return setError("Seleccioná al menos un pedido confirmado.");
    setBusy(true);
    setError("");
    try {
      const r = await erpApi.createRutaReparto({ pedido_ids: Array.from(seleccion), repartidor_id: repartidorId, fecha, observaciones, orden });
      setNotice(orden === "ZONA" ? "Ruta creada y ordenada por zona." : "Ruta creada.");
      setSeleccion(new Set());
      setObservaciones("");
      await cargar();
      await abrirRuta(r.rutaId);
      setVista("RUTAS");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function abrirRuta(id: number) {
    setError("");
    try {
      const r = await erpApi.getRutaReparto(id);
      setDetalle(r);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function mover(index: number, delta: number) {
    if (!detalle) return;
    const lista = [...detalle.pedidos];
    const destino = index + delta;
    if (destino < 0 || destino >= lista.length) return;
    const [item] = lista.splice(index, 1);
    lista.splice(destino, 0, item);
    setDetalle({ ...detalle, pedidos: lista.map((p: any, i: number) => ({ ...p, orden: i + 1 })) });
  }

  async function guardarOrden() {
    if (!detalle) return;
    setBusy(true);
    try {
      await erpApi.reordenarRutaReparto(detalle.ruta.id, detalle.pedidos.map((p: any) => p.ruta_pedido_id));
      setNotice("Orden de la ruta guardado.");
      await abrirRuta(detalle.ruta.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function cerrarRuta() {
    if (!detalle || !confirm("¿Cerrar la ruta? El repartidor dejará de verla.")) return;
    setBusy(true);
    try {
      await erpApi.cerrarRutaReparto(detalle.ruta.id);
      setNotice("Ruta cerrada.");
      setDetalle(null);
      await cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function imprimirHoja() {
    if (!detalle) return;
    const filas = detalle.pedidos.map((p: any, i: number) => `<tr><td>${i + 1}</td><td>${p.cliente || ""}</td><td>${p.domicilio || ""} ${p.localidad || ""}</td><td>${p.telefono || ""}</td><td>$${Number(p.total || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td></tr>`).join("");
    const carga = detalle.carga.map((c: any) => `<tr><td>${c.codigo}</td><td>${c.descripcion}</td><td>${Number(c.cantidad).toLocaleString("es-AR")}</td></tr>`).join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Hoja de ruta ${detalle.ruta.numero}</title><style>@page{size:A4 portrait;margin:10mm}body{font-family:Arial;font-size:10px}h1{font-size:15px}h2{font-size:12px;margin-top:14px}table{width:100%;border-collapse:collapse;margin-top:6px}th,td{border:1px solid #999;padding:3px 5px;text-align:left}th{background:#eee}</style></head><body><h1>HOJA DE RUTA ${detalle.ruta.numero}</h1><div>Fecha: ${detalle.ruta.fecha} · Repartidor: ${detalle.ruta.repartidor_nombre || "-"} · Paradas: ${detalle.pedidos.length}</div><h2>Recorrido</h2><table><thead><tr><th>#</th><th>Cliente</th><th>Dirección</th><th>Teléfono</th><th>Pedido</th></tr></thead><tbody>${filas}</tbody></table><h2>Carga del vehículo</h2><table><thead><tr><th>Código</th><th>Producto</th><th>Cantidad</th></tr></thead><tbody>${carga}</tbody></table></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }

  return <div className="products-page">
    <div className="products-toolbar">
      <div><h3>Reparto</h3><p>Armá la ruta con los pedidos confirmados y seguí las entregas.</p></div>
      <button className="secondary-action" onClick={cargar}><RefreshCw size={16} /> Actualizar</button>
    </div>
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}

    <div className="catalog-tabs">
      <button className={vista === "ARMAR" ? "active" : ""} onClick={() => setVista("ARMAR")}>Armar ruta</button>
      <button className={vista === "RUTAS" ? "active" : ""} onClick={() => setVista("RUTAS")}>Rutas armadas</button>
    </div>

    {vista === "ARMAR" && <>
      <div className="report-filters">
        <label>Repartidor<select value={repartidorId || ""} onChange={(e) => setRepartidorId(Number(e.target.value) || null)}><option value="">Sin asignar</option>{repartidores.map((u: any) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></label>
        <label>Fecha<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        <label>Observaciones<input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Opcional" /></label>
      </div>
      <div className="products-card"><table>
        <thead><tr><th></th><th>Fecha</th><th>Vendedor</th><th>Cliente</th><th>Dirección</th><th>Total</th></tr></thead>
        <tbody>{pedidos.filter((p: any) => !p.en_ruta).map((p: any) => <tr key={p.id}>
          <td><input type="checkbox" checked={seleccion.has(p.id)} onChange={() => toggle(p.id)} /></td>
          <td>{String(p.fecha || "").slice(0, 10)}</td>
          <td>{p.vendedor || "-"}</td>
          <td><strong>{p.cliente}</strong><small>{p.tipo === "PRESUPUESTO" ? "Presupuesto" : "Nota de pedido"} {String(p.punto_venta || "").padStart(4, "0")}-{String(p.numero || "").padStart(8, "0")}</small></td>
          <td>{p.domicilio || ""} {p.localidad ? `· ${p.localidad}` : ""}</td>
          <td className="price">$ {Number(p.total || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
        </tr>)}</tbody>
      </table>
      {!pedidos.filter((p: any) => !p.en_ruta).length && <div className="empty-table">No hay pedidos confirmados pendientes de reparto.</div>}
      <div className="modal-actions">
        <button disabled={busy} onClick={() => crear("MANUAL")}><Truck size={15} /> Crear ruta manual</button>
        <button className="primary-action" disabled={busy} onClick={() => crear("ZONA")}><Truck size={15} /> Crear ruta ordenada por zona</button>
      </div>
      </div>
    </>}

    {vista === "RUTAS" && <>
      <div className="report-filters">
        <label>Estado<select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}><option value="">Todas</option><option value="ARMADA">ARMADA</option><option value="CERRADA">CERRADA</option></select></label>
        <label>Desde<input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} /></label>
        <label>Hasta<input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} /></label>
      </div>
      <div className="products-card"><table>
      <thead><tr><th>Ruta</th><th>Fecha</th><th>Repartidor</th><th>Paradas</th><th>Total</th><th>Estado</th><th></th></tr></thead>
      <tbody>{rutas.filter((r: any) => {
        if (filtroEstado && r.estado !== filtroEstado) return false;
        const f = String(r.fecha || "").slice(0, 10);
        if (filtroDesde && f < filtroDesde) return false;
        if (filtroHasta && f > filtroHasta) return false;
        return true;
      }).map((r: any) => <tr key={r.id}>
        <td><strong>{r.numero}</strong></td>
        <td>{String(r.fecha || "").slice(0, 10)}</td>
        <td>{r.repartidor_nombre || "Sin asignar"}</td>
        <td>{r.pedidos}</td>
        <td className="price">$ {Number(r.total || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
        <td><span className={r.estado === "CERRADA" ? "badge" : "badge success"}>{r.estado}</span></td>
        <td><button className="secondary-action" onClick={() => abrirRuta(r.id)}>Abrir</button></td>
      </tr>)}</tbody>
    </table>
    {!rutas.length && <div className="empty-table">Todavía no hay rutas armadas.</div>}
    </div></>}

    {detalle && <div className="modal-backdrop"><div className="modal polished-modal order-review-modal">
      <div className="modal-head">
        <div><h3>Ruta {detalle.ruta.numero}</h3><p>{String(detalle.ruta.fecha || "").slice(0, 10)} · Repartidor: <strong>{detalle.ruta.repartidor_nombre || "Sin asignar"}</strong> · {detalle.pedidos.length} paradas</p></div>
        <button onClick={() => setDetalle(null)}><X /></button>
      </div>

      <table className="order-review-items"><thead><tr><th>#</th><th>Cliente</th><th>Dirección</th><th>Pedido</th><th>Entrega</th><th></th></tr></thead>
        <tbody>{detalle.pedidos.map((p: any, i: number) => <tr key={p.ruta_pedido_id}>
          <td>{i + 1}</td>
          <td><strong>{p.cliente}</strong>{p.telefono && <small>{p.telefono}</small>}</td>
          <td>{p.domicilio || ""} {p.localidad ? `· ${p.localidad}` : ""}{p.clat != null && <a className="link-button" href={`https://www.google.com/maps?q=${p.clat},${p.clng}`} target="_blank" rel="noreferrer"><MapPin size={13} /></a>}</td>
          <td className="price">$ {Number(p.total || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
          <td><span className={p.estado_entrega === "ENTREGADO" ? "badge success" : p.estado_entrega === "NO_ENTREGADO" ? "badge danger" : p.estado_entrega === "PARCIAL" ? "badge warning" : "badge"}>{p.estado_entrega}</span></td>
          <td>{detalle.ruta.estado !== "CERRADA" && <span className="order-move-btns"><button onClick={() => mover(i, -1)}><ArrowUp size={14} /></button><button onClick={() => mover(i, 1)}><ArrowDown size={14} /></button></span>}</td>
        </tr>)}</tbody>
      </table>

      <div className="order-historial">
        <h4>Carga del vehículo ({detalle.carga.length} productos)</h4>
        <table className="order-review-items"><thead><tr><th>Código</th><th>Producto</th><th>Cantidad total</th></tr></thead>
          <tbody>{detalle.carga.map((c: any) => <tr key={`${c.codigo}-${c.descripcion}`}><td>{c.codigo}</td><td>{c.descripcion}</td><td><strong>{Number(c.cantidad).toLocaleString("es-AR")}</strong></td></tr>)}</tbody>
        </table>
      </div>

      <div className="modal-actions">
        <button onClick={imprimirHoja}><Printer size={15} /> Imprimir hoja</button>
        {detalle.ruta.estado !== "CERRADA" && <button disabled={busy} onClick={guardarOrden}>Guardar orden</button>}
        {detalle.ruta.estado !== "CERRADA" && <button className="danger-action" disabled={busy} onClick={cerrarRuta}>Cerrar ruta</button>}
      </div>
    </div></div>}
  </div>;
}
