import { useEffect, useState } from "react";
import { Check, MapPin, MessageCircle, Printer, RefreshCw, Search, Trash2, Truck, X } from "lucide-react";
import { erpApi, normalizarUrlArchivo } from "../../services/api";
import { useServerRows } from "../../hooks/useServerStorage";
import { fmtFecha, fmtFechaHora } from "../../utils/fecha";
import { PdfViewerModal } from "../shared/PdfViewerModal";

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
  const [pdfModal, setPdfModal] = useState<{ url: string; title: string } | null>(null);
  const fmtMon = (n: any) => Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function imprimirPendientes() {
    setError("");
    try {
      const r = await erpApi.pdfPedidosPendientes({
        estado: estado || "PENDIENTE",
        vendedor_id: vendedorId || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      });
      setPdfModal({ url: normalizarUrlArchivo(r.pdf_url || r.url), title: `Pedidos ${estado || "PENDIENTE"} (${r.total})` });
    } catch (e: any) {
      setError(e.message);
    }
  }

  function compartirWhatsapp(telefono: string | null | undefined, mensaje: string) {
    const tel = String(telefono || "").replace(/[^0-9]/g, "");
    const url = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}` : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  }

  function compartirPedido() {
    if (!detalle) return;
    const p = detalle.pedido;
    const lineas = (detalle.items || []).map((i: any) => `• ${Number(i.cantidad).toLocaleString("es-AR")} x ${i.descripcion}`).join("\n");
    compartirWhatsapp(p.telefono, `Pedido #${String(p.numero || 0).padStart(6, "0")} - ${p.cliente || "CONSUMIDOR FINAL"}\n${lineas}\nTotal: $ ${fmtMon(p.total)}\n¡Gracias por su compra!`);
  }

  function compartirRecibo(cobro: any) {
    if (!detalle) return;
    const p = detalle.pedido;
    compartirWhatsapp(p.telefono, `Recibo de cobro ${String(cobro.recibo_punto_venta || 1).padStart(4, "0")}-${String(cobro.recibo_numero || cobro.recibo_id || 0).padStart(8, "0")}\nCliente: ${p.cliente || "CONSUMIDOR FINAL"}\nImporte: $ ${fmtMon(cobro.importe)} (${cobro.medio})\nAcreditado a su cuenta corriente. ¡Gracias!`);
  }

  async function confirmarCobro(cobroId: number) {
    if (!detalle) return;
    if (!confirm("¿Confirmar este dinero? Se genera el recibo y el movimiento de cuenta corriente del cliente.")) return;
    setBusy(true);
    setError("");
    try {
      const r = await erpApi.confirmarCobroPedido(cobroId);
      setNotice(`Cobro confirmado. Recibo ${String(r.recibo?.punto_venta || 1).padStart(4, "0")}-${String(r.recibo?.numero || 0).padStart(8, "0")} generado y enviado a cuenta corriente.`);
      await abrir(detalle.pedido.id);
      await cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

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
      const r = await erpApi.revisarPedidoMovil(detalle.pedido.id, {
        estado: nuevoEstado,
        items: detalle.items.map((i: any) => ({ venta_item_id: i.id, cantidad: Number(cantidades[i.id] ?? i.cantidad) })),
        detalle: detalleTexto,
      });
      if (r.recibo) {
        setNotice(`Pedido ${nuevoEstado === "CONFIRMADO" ? "confirmado" : "confirmado parcialmente"} y recibo ${String(r.recibo.punto_venta || 1).padStart(4, "0")}-${String(r.recibo.numero || 0).padStart(8, "0")} generado por el dinero recibido (enviado a cuenta corriente).`);
      } else {
        setNotice(`Pedido ${nuevoEstado === "CONFIRMADO" ? "confirmado" : nuevoEstado === "PARCIAL" ? "confirmado parcialmente" : "rechazado"}.`);
      }
      setDetalle(null);
      await cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmarTodoElDinero() {
    if (!detalle) return;
    const pendientes = (detalle.cobros || []).filter((c: any) => c.estado === "PENDIENTE");
    const total = pendientes.reduce((n: number, c: any) => n + Number(c.importe || 0), 0);
    if (!confirm(`¿Confirmar todo el dinero pendiente (${pendientes.length} pago/s por $ ${fmtMon(total)})? Se genera un solo recibo multimedio.`)) return;
    setBusy(true);
    setError("");
    try {
      const r = await erpApi.confirmarCobrosPedido(detalle.pedido.id);
      setNotice(`Dinero confirmado. Recibo ${String(r.recibo?.punto_venta || 1).padStart(4, "0")}-${String(r.recibo?.numero || 0).padStart(8, "0")} generado y enviado a cuenta corriente.`);
      await abrir(detalle.pedido.id);
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
      <div className="inline-actions">
        <button className="secondary-action" onClick={imprimirPendientes}><Printer size={16} /> PDF pendientes</button>
        <button className="secondary-action" onClick={cargar}><RefreshCw size={16} /> Actualizar</button>
      </div>
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
      <thead><tr><th>Fecha</th><th>Canal</th><th>Vendedor</th><th>Cliente</th><th>Ubicación</th><th>Total</th><th>Estado</th><th>Dinero</th><th></th></tr></thead>
      <tbody>{pedidos.map((p: any) => <tr key={p.id}>
        <td>{fmtFecha(p.fecha)}<small>{String(p.hora_visita || "").slice(0, 5)}</small></td>
        <td><span className="badge">{p.canal || "POS"}</span></td>
        <td>{p.vendedor || "-"}</td>
        <td><strong>{p.cliente || "CONSUMIDOR FINAL"}</strong><small>{p.tipo === "PRESUPUESTO" ? "Presupuesto" : "Nota de pedido"} {String(p.punto_venta || "").padStart(4, "0")}-{String(p.numero || "").padStart(8, "0")}</small></td>
        <td>{p.latitud != null && p.longitud != null ? <a className="link-button" href={`https://www.google.com/maps?q=${p.latitud},${p.longitud}`} target="_blank" rel="noreferrer"><MapPin size={14} /> Ver mapa</a> : "—"}</td>
        <td className="price">$ {Number(p.total || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
        <td><span className={claseEstado(p.estado_pedido)}>{p.estado_pedido || "PENDIENTE"}</span>{p.facturado ? <span className="badge success" style={{ marginLeft: 6 }} title={p.cae ? `CAE ${p.cae}` : "Facturado"}>FACTURADO</span> : null}</td>
        <td>{Number(p.cobro_pendiente || 0) > 0 ? <span className="badge warning" title="Dinero declarado por vendedor/repartidor, pendiente de confirmar">$ {fmtMon(p.cobro_pendiente)}</span> : "—"}</td>
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
          <td><div className="order-item-actions">{!yaRevisado && <>
            <button className={noDisponibles.has(i.id) ? "secondary-action" : "link-button"} onClick={() => marcarNoDisponible(i)}>{noDisponibles.has(i.id) ? "Restituir" : "No disponible"}</button>
            <button className="link-button danger" title="Quitar este producto del pedido" onClick={() => { setNoDisponibles(new Set(noDisponibles).add(i.id)); setCantidades({ ...cantidades, [i.id]: 0 }); }}><Trash2 size={15} /> Quitar</button>
          </>}</div></td>
        </tr>)}</tbody>
      </table>

      {(detalle.cobros || []).length > 0 && <div className="order-cobros">
        <h4>Dinero del pedido · cuenta corriente del cliente</h4>
        {Number(detalle.saldo || 0) !== 0 && <p className="report-sub">Saldo actual del cliente: <strong>$ {fmtMon(detalle.saldo)}</strong></p>}
        {(detalle.cobros || []).filter((c: any) => c.estado === "PENDIENTE").length > 1 && <button className="primary-action" disabled={busy} onClick={confirmarTodoElDinero}><Check size={15} /> Confirmar todo el dinero pendiente ($ {fmtMon((detalle.cobros || []).filter((c: any) => c.estado === "PENDIENTE").reduce((n: number, c: any) => n + Number(c.importe || 0), 0))})</button>}
        {detalle.cobros.map((c: any) => <div key={c.id} className="order-cobros-linea">
          <span className="badge">{c.origen === "REPARTIDOR" ? "Repartidor" : "Vendedor"}</span>
          <strong>{c.medio}</strong>
          <b>$ {fmtMon(c.importe)}</b>
          {c.medio === "CHEQUE" && <small>Cheque {c.cheque_numero || "s/n"} · {c.banco || "sin banco"}{c.cheque_vencimiento ? ` · vence ${fmtFecha(c.cheque_vencimiento)}` : ""}</small>}
          {c.foto_path && <a className="link-button" href={c.foto_path} target="_blank" rel="noreferrer">Ver foto del cheque</a>}
          {c.estado === "PENDIENTE"
            ? <button className="primary-action" disabled={busy} onClick={() => confirmarCobro(c.id)}><Check size={15} /> Confirmar y generar recibo</button>
            : <span className="badge success" title={c.confirmado_por_nombre ? `Confirmado por ${c.confirmado_por_nombre}` : ""}>Recibo #{c.recibo_id} → cuenta corriente</span>}
          {c.estado === "CONFIRMADO" && <button className="secondary-action" onClick={() => compartirRecibo(c)}><MessageCircle size={15} /> Compartir recibo</button>}
        </div>)}
      </div>}

      {!yaRevisado && <>
        <div className="info-note" style={{ marginBottom: 8 }}>
          <strong>¿Qué hace cada botón?</strong>
          <div>· <strong>Confirmar todo</strong>: prepara el pedido completo, tal como quedó la lista de arriba.</div>
          <div>· <strong>Confirmar parcial</strong>: prepara <em>solo</em> las cantidades finales que dejaste; lo que quitaste o marcaste "No disponible" no se prepara.</div>
          <div>· <strong>Rechazar</strong>: anula el pedido.</div>
        </div>
        <label className="full">Observación de la revisión<input value={detalleTexto} onChange={(e) => setDetalleTexto(e.target.value)} placeholder="Ej.: faltaba stock de un producto" /></label>
        <div className="modal-actions">
          <button className="danger-action" disabled={busy} onClick={() => revisar("RECHAZADO")} title="Anula el pedido">Rechazar</button>
          <button disabled={busy} onClick={() => revisar("PARCIAL")} title="Prepara solo las cantidades finales de la lista">Confirmar parcial</button>
          <button className="primary-action" disabled={busy} onClick={() => revisar("CONFIRMADO")} title="Prepara el pedido completo"><Check size={16} /> Confirmar todo</button>
        </div>
      </>}

      {yaRevisado && detalle.pedido.estado_pedido !== "RECHAZADO" && <div className="modal-actions">
        {["PREPARANDO", "DESPACHADO", "ENTREGADO"].map((x) => <button key={x} disabled={busy || detalle.pedido.estado_pedido === x} onClick={() => avanzar(x)}><Truck size={15} /> {x}</button>)}
        <button className="secondary-action" onClick={compartirPedido}><MessageCircle size={15} /> Compartir pedido por WhatsApp</button>
      </div>}

      <div className="order-historial">
        <h4>Trazabilidad</h4>
        {detalle.historial.map((h: any) => <div key={h.id} className="order-historial-linea">
          <span>{fmtFechaHora(h.created_at)}</span>
          <strong>{h.usuario_nombre || "SISTEMA"}</strong>
          <em className={claseEstado(h.estado)}>{h.estado}</em>
          {h.detalle && <small>{h.detalle}</small>}
        </div>)}
        {!detalle.historial.length && <div className="empty-table">Sin movimientos.</div>}
      </div>
    </div></div>}
    {pdfModal && <PdfViewerModal url={pdfModal.url} title={pdfModal.title} onClose={() => setPdfModal(null)} />}
  </div>;
}
