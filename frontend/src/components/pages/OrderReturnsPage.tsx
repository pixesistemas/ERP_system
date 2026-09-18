import { useEffect, useState } from "react";
import { Search, Undo2, FileText } from "lucide-react";
import { erpApi } from "../../services/api";
import { fmtFecha } from "../../utils/fecha";
import { PdfViewerModal } from "../shared/PdfViewerModal";

/*
 * Anular pedidos: busca clientes con pedidos activos, permite quitar
 * productos (parcial o totalmente) de esos pedidos, registra la fecha de
 * devolución y genera el PDF de devolución.
 */
export function OrderReturnsPage() {
  const [q, setQ] = useState("");
  const [clientes, setClientes] = useState<any[]>([]);
  const [cliente, setCliente] = useState<any>(null);
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [pedido, setPedido] = useState<any>(null);
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [devoluciones, setDevoluciones] = useState<any[]>([]);
  const [pdfModal, setPdfModal] = useState<{ url: string; title: string } | null>(null);

  async function cargarDevoluciones() {
    try {
      const r = await erpApi.listDevolucionesPedido();
      setDevoluciones(r.devoluciones || []);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function buscar(texto = q) {
    setError("");
    try {
      const r = await erpApi.listPedidosClientes(texto);
      setClientes(r.clientes || []);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    buscar("");
    cargarDevoluciones();
  }, []);

  async function abrirCliente(c: any) {
    setError("");
    setCliente(c);
    setPedido(null);
    setCantidades({});
    setMotivo("");
    try {
      const r = await erpApi.listPedidosActivos(Number(c.cliente_id));
      setPedidos(r.pedidos || []);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function abrirPedido(p: any) {
    setPedido(p);
    const inicial: Record<number, number> = {};
    for (const it of p.items || []) inicial[it.id] = 0;
    setCantidades(inicial);
    setMotivo("");
    setNotice("");
  }

  function marcarTodo() {
    if (!pedido) return;
    const todas: Record<number, number> = {};
    for (const it of pedido.items || []) todas[it.id] = Number(it.cantidad);
    setCantidades(todas);
  }

  async function devolver() {
    if (!pedido) return;
    const items = Object.entries(cantidades)
      .filter(([, valor]) => Number(valor) > 0)
      .map(([id, valor]) => ({ item_id: Number(id), cantidad: Number(valor) }));
    if (!items.length) return setNotice("Indicá la cantidad a devolver de al menos un producto.");
    if (!confirm("¿Registrar la devolución de los productos seleccionados?")) return;
    setBusy(true);
    setError("");
    try {
      const r = await erpApi.devolverItemsPedido(pedido.id, { items, motivo });
      setNotice(r.anulado ? "Devolución registrada: el pedido quedó anulado (sin productos)." : "Devolución registrada y PDF generado.");
      if (r.devolucion?.pdf_url) setPdfModal({ url: r.devolucion.pdf_url, title: `Devolución N° ${r.devolucion.id}` });
      await abrirCliente(cliente);
      await cargarDevoluciones();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="products-page">
    <div className="products-toolbar"><div><h3>Anular pedidos</h3><p>Quitá productos de pedidos activos: se registra la fecha de devolución y se genera el PDF.</p></div></div>
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="success-box">{notice}</div>}

    <div className="products-card">
      <h3><Search size={16} /> Clientes con pedidos activos</h3>
      <div className="report-filters">
        <label>Buscar cliente<input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && buscar()} placeholder="Nombre o CUIT..." /></label>
        <button className="secondary-action" onClick={() => buscar()}>Buscar</button>
      </div>
      <table><thead><tr><th>Cliente</th><th>CUIT</th><th>Pedidos</th><th>Total</th><th></th></tr></thead><tbody>
        {clientes.map((c: any) => <tr key={c.cliente_id} className={cliente?.cliente_id === c.cliente_id ? "selected-row" : ""}>
          <td><strong>{c.cliente}</strong></td>
          <td>{c.cuit || "-"}</td>
          <td>{c.pedidos}</td>
          <td className="price">$ {Number(c.total || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
          <td><button className="secondary-action" onClick={() => abrirCliente(c)}>Ver pedidos</button></td>
        </tr>)}
      </tbody></table>
      {!clientes.length && <div className="empty-table">No hay clientes con pedidos activos.</div>}
    </div>

    {cliente && <div className="products-card">
      <h3>Pedidos activos de {cliente.cliente}</h3>
      <table><thead><tr><th>Fecha</th><th>Pedido</th><th>Total</th><th></th></tr></thead><tbody>
        {pedidos.map((p: any) => <tr key={p.id} className={pedido?.id === p.id ? "selected-row" : ""}>
          <td>{fmtFecha(p.fecha)}</td>
          <td><strong>{p.tipo === "NOTA_PEDIDO" ? "Nota de pedido" : p.tipo === "PRESUPUESTO" ? "Presupuesto" : p.tipo === "RESERVA" ? "Reserva" : p.tipo === "REMITO" ? `Remito ${p.subtipo || "X"}` : p.tipo}</strong> {String(p.punto_venta || "").padStart(4, "0")}-{String(p.numero || "").padStart(8, "0")}</td>
          <td className="price">$ {Number(p.total || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
          <td><button className="secondary-action" onClick={() => abrirPedido(p)}>Quitar productos</button></td>
        </tr>)}
      </tbody></table>
      {!pedidos.length && <div className="empty-table">Ese cliente no tiene pedidos activos.</div>}
    </div>}

    {pedido && <div className="products-card">
      <div className="products-toolbar"><div><h3>Productos del pedido</h3><p>Indicá cuántas unidades se devuelven. Si devolvés todo, el producto sale del pedido.</p></div><button className="secondary-action" onClick={marcarTodo}>Marcar todo</button></div>
      <table><thead><tr><th>Código</th><th>Producto</th><th>Cant. pedida</th><th>Precio unit.</th><th>Devolver</th><th>Subtotal a devolver</th></tr></thead><tbody>
        {(pedido.items || []).map((it: any) => {
          const cant = Number(cantidades[it.id] || 0);
          const subtotal = Number(it.precio_unitario || 0) * cant * (1 + Number(it.iva || 0) / 100);
          return <tr key={it.id}>
            <td>{it.codigo}</td>
            <td>{it.descripcion}</td>
            <td>{Number(it.cantidad).toLocaleString("es-AR")}</td>
            <td className="price">$ {Number(it.precio_unitario || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
            <td><input type="number" min={0} max={Number(it.cantidad)} step="0.001" value={cantidades[it.id] ?? 0} onFocus={e => e.currentTarget.select()} onChange={e => setCantidades({ ...cantidades, [it.id]: Math.min(Number(e.target.value) || 0, Number(it.cantidad)) })} /></td>
            <td className="price">$ {subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
          </tr>;
        })}
      </tbody></table>
      <div className="report-filters">
        <label className="full">Motivo de la devolución<input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej.: el cliente se arrepintió, producto fallado..." /></label>
      </div>
      <div className="modal-actions">
        <button className="primary-action" disabled={busy} onClick={devolver}><Undo2 size={16} /> {busy ? "Registrando..." : "Registrar devolución"}</button>
      </div>
    </div>}

    <div className="products-card">
      <h3><FileText size={16} /> Devoluciones registradas</h3>
      <table><thead><tr><th>Fecha devolución</th><th>Cliente</th><th>Pedido</th><th>Ítems</th><th>Total</th><th></th></tr></thead><tbody>
        {devoluciones.map((d: any) => <tr key={d.id}>
          <td>{fmtFecha(d.fecha_devolucion)}</td>
          <td>{d.cliente_nombre}</td>
          <td>{d.documento_id ? `Doc #${d.documento_id}` : `Venta #${d.venta_id}`}</td>
          <td>{d.items}</td>
          <td className="price">$ {Number(d.total || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
          <td>{d.pdf_url ? <button onClick={() => setPdfModal({ url: d.pdf_url, title: `Devolución N° ${d.id}` })}><FileText size={16} /> Ver PDF</button> : "-"}</td>
        </tr>)}
      </tbody></table>
      {!devoluciones.length && <div className="empty-table">Todavía no hay devoluciones registradas.</div>}
    </div>

    {pdfModal && <PdfViewerModal url={pdfModal.url} title={pdfModal.title} onClose={() => setPdfModal(null)} />}
  </div>;
}
