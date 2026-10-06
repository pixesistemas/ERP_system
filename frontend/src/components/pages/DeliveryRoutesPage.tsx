import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, MapPin, Printer, RefreshCw, Truck, X } from "lucide-react";
import { api, erpApi } from "../../services/api";
import { fmtFecha } from "../../utils/fecha";

/*
 * Dibuja un mapa simple (sin servicios externos) con los puntos de la
 * ruta numerados en orden y la dirección flotante en cada punto.
 */
function escaparHtmlMapa(valor: any) {
  return String(valor ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function construirMapaSvg(pedidos: any[]) {
  const puntos = (pedidos || []).filter((p) => p.clat != null && p.clng != null);
  if (puntos.length < 2) {
    return '<p style="font-size:11px;color:#666">No hay coordenadas suficientes para dibujar el mapa. Cargá latitud y longitud en los clientes para verlo.</p>';
  }
  const ancho = 780,
    alto = 520,
    pad = 70;
  const lats = puntos.map((p) => Number(p.clat)),
    lngs = puntos.map((p) => Number(p.clng));
  const minLat = Math.min(...lats),
    maxLat = Math.max(...lats),
    minLng = Math.min(...lngs),
    maxLng = Math.max(...lngs);
  const rangoLat = maxLat - minLat || 0.01,
    rangoLng = maxLng - minLng || 0.01;
  const x = (lng: number) => pad + ((lng - minLng) / rangoLng) * (ancho - 2 * pad);
  const y = (lat: number) => alto - pad - ((lat - minLat) / rangoLat) * (alto - 2 * pad);
  const marcas = puntos
    .map((p, i) => {
      const px = x(Number(p.clng)),
        py = y(Number(p.clat));
      const etiqueta = `${i + 1}. ${p.cliente || ""} — ${p.domicilio || ""}${p.localidad ? `, ${p.localidad}` : ""}`;
      const anchoEtq = Math.min(370, etiqueta.length * 5.5 + 14);
      const derecha = px < ancho / 2;
      const lx = derecha ? px + 14 : px - 14 - anchoEtq;
      const ly = py - 12;
      return `<g>
        <line x1="${px}" y1="${py}" x2="${derecha ? px + 12 : px - 12}" y2="${py - 8}" stroke="#999" stroke-width="1"/>
        <circle cx="${px}" cy="${py}" r="11" fill="#6952C4" stroke="#fff" stroke-width="2"/>
        <text x="${px}" y="${py + 4}" text-anchor="middle" font-size="11" font-weight="bold" fill="#fff">${i + 1}</text>
        <rect x="${lx}" y="${ly - 12}" width="${anchoEtq}" height="22" rx="5" fill="#fff" fill-opacity="0.94" stroke="#C9BFEA"/>
        <text x="${lx + 7}" y="${ly + 3}" font-size="10" fill="#333">${escaparHtmlMapa(etiqueta)}</text>
      </g>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${ancho} ${alto}" width="100%" style="border:1px solid #ccc;background:#F4F6FA">${marcas}</svg>`;
}

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
  const [ordenCambiado, setOrdenCambiado] = useState(false);
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

  /* Si hay un usuario con rol REPARTIDOR, se preselecciona. */
  useEffect(() => {
    if (repartidorId) return;
    const rep = repartidores.find((u: any) => String(u.rol || "").toUpperCase() === "REPARTIDOR");
    if (rep) setRepartidorId(Number(rep.id));
  }, [repartidores]);

  function toggle(id: number) {
    const next = new Set(seleccion);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSeleccion(next);
  }

  async function crear(orden: "MANUAL" | "ZONA") {
    if (!seleccion.size) return setError("Seleccioná al menos un pedido confirmado.");
    if (!repartidorId && !confirm("No asignaste repartidor: no la va a ver en su app. ¿Crear la ruta igual?")) return;
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
      setOrdenCambiado(false);
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
    setOrdenCambiado(true);
  }

  async function guardarOrden() {
    if (!detalle) return;
    setBusy(true);
    try {
      await erpApi.reordenarRutaReparto(detalle.ruta.id, detalle.pedidos.map((p: any) => p.ruta_pedido_id));
      setNotice("Orden de las paradas guardado.");
      setOrdenCambiado(false);
      await abrirRuta(detalle.ruta.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function cerrarRuta() {
    if (!detalle || !confirm("¿Finalizar la ruta? Deja de verse en la app del repartidor. Si te equivocaste, después la podés reabrir.")) return;
    setBusy(true);
    try {
      const r: any = await erpApi.cerrarRutaReparto(detalle.ruta.id);
      setNotice(r?.liberados
        ? `Ruta finalizada. ${r.liberados} pedido(s) sin entregar volvieron a la lista para armar otra ruta.`
        : "Ruta finalizada. El repartidor ya no la ve en su app.");
      setDetalle(null);
      await cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function reabrirRuta() {
    if (!detalle || !confirm("¿Reabrir la ruta para que vuelva a verse en la app del repartidor?")) return;
    setBusy(true);
    try {
      await erpApi.reabrirRutaReparto(detalle.ruta.id);
      setNotice("Ruta reabierta: el repartidor ya la ve en su app.");
      await abrirRuta(detalle.ruta.id);
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
    const mapa = construirMapaSvg(detalle.pedidos);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Hoja de ruta ${detalle.ruta.numero}</title><style>@page{size:A4 portrait;margin:10mm}body{font-family:Arial;font-size:10px}h1{font-size:15px}h2{font-size:12px;margin-top:14px}table{width:100%;border-collapse:collapse;margin-top:6px}th,td{border:1px solid #999;padding:3px 5px;text-align:left}th{background:#eee}</style></head><body><h1>HOJA DE RUTA ${detalle.ruta.numero}</h1><div>Fecha: ${fmtFecha(detalle.ruta.fecha)} · Repartidor: ${detalle.ruta.repartidor_nombre || "-"} · Paradas: ${detalle.pedidos.length}</div><h2>Recorrido</h2><table><thead><tr><th>#</th><th>Cliente</th><th>Dirección</th><th>Teléfono</th><th>Pedido</th></tr></thead><tbody>${filas}</tbody></table><h2>Carga del vehículo</h2><table><thead><tr><th>Código</th><th>Producto</th><th>Cantidad</th></tr></thead><tbody>${carga}</tbody></table><h2 style="page-break-before:always">Mapa de entregas</h2><div style="font-size:10px;color:#555;margin-bottom:6px">Puntos numerados en el orden del recorrido. Cada etiqueta muestra la dirección.</div>${mapa}</body></html>`);
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
          <td>{fmtFecha(p.fecha)}</td>
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
        <td>{fmtFecha(r.fecha)}</td>
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
        <div><h3>Ruta {detalle.ruta.numero}</h3><p>{fmtFecha(detalle.ruta.fecha)} · Repartidor: <strong>{detalle.ruta.repartidor_nombre || "Sin asignar"}</strong> · {detalle.pedidos.length} paradas</p></div>
        <button onClick={() => setDetalle(null)}><X /></button>
      </div>

      <table className="order-review-items"><thead><tr><th>#</th><th>Cliente</th><th>Dirección</th><th>Pedido</th><th>Entrega</th><th></th></tr></thead>
        <tbody>{detalle.pedidos.map((p: any, i: number) => <tr key={p.ruta_pedido_id}>
          <td>{i + 1}</td>
          <td><strong>{p.cliente}</strong>{p.telefono && <small>{p.telefono}</small>}{p.devoluciones?.length ? <small style={{ color: "#B23B58", display: "block" }}>Devuelto: {p.devoluciones.map((d: any) => `${d.descripcion || d.codigo} x${Number(d.cantidad)}`).join(", ")}</small> : null}</td>
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
        {detalle.ruta.estado !== "CERRADA" && ordenCambiado && <button disabled={busy} onClick={guardarOrden} title="Guarda el nuevo orden de las paradas para el repartidor">Guardar el orden de las paradas</button>}
        {detalle.ruta.estado !== "CERRADA" && <button className="danger-action" disabled={busy} onClick={cerrarRuta}>Finalizar ruta</button>}
        {detalle.ruta.estado === "CERRADA" && <button className="primary-action" disabled={busy} onClick={reabrirRuta}>Reabrir ruta</button>}
      </div>
    </div></div>}
  </div>;
}
